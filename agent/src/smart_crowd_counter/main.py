"""Smart Crowd Counter analysis agent.

A Google ADK (Agent Development Kit) agent that fetches conference
photos from MinIO AIStor, downscales an in-memory copy so vision token
counts stay compact, runs a local Ollama vision model, and returns
structured crowd estimates.
"""

import base64
import io
import json
import logging
import os
import re
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from google.genai import types
from minio import Minio
from PIL import Image, ImageOps
from pydantic import BaseModel

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import InMemoryRunner

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
os.environ.setdefault("OLLAMA_API_BASE", OLLAMA_BASE_URL)
AGENT_MODEL = os.environ.get("AGENT_MODEL", "qwen2.5vl:7b")
OLLAMA_NUM_CTX = int(os.environ.get("OLLAMA_NUM_CTX", "8192"))
MAX_INFERENCE_DIMENSION = int(os.environ.get("MAX_INFERENCE_DIMENSION", "1280"))

S3_PHOTOS_BUCKET = os.environ.get("S3_PHOTOS_BUCKET", "snaps")
S3_RESULTS_BUCKET = os.environ.get("S3_RESULTS_BUCKET", "analysis")

INSTRUCTION = """You analyze conference session photos.
Estimate the total number of attendees visible, the number of people
with a raised hand, and write a one-sentence caption for the photo.
Respond with ONLY a bare JSON object, no markdown fences, with keys:
total_attendees, raised_hands, percentage_with_hands_up, caption.
Counts must be non-negative integers or null when they cannot be
estimated. percentage_with_hands_up must be null unless both counts
are known. caption must be a short string or null."""

root_agent = LlmAgent(
    name="crowd_counter",
    model=LiteLlm(
        model=f"ollama_chat/{AGENT_MODEL}",
        api_base=OLLAMA_BASE_URL,
        extra_body={"options": {"num_ctx": OLLAMA_NUM_CTX}},
    ),
    instruction=INSTRUCTION,
    output_key="analysis",
)

runner = InMemoryRunner(agent=root_agent, app_name="smart-crowd-counter")
app = FastAPI(title="Smart Crowd Counter Agent")


class AnalyzeRequest(BaseModel):
    path: str
    image_base64: str | None = None


JSON_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$")


def _s3_client() -> Minio:
    raw = os.environ.get("S3_ENDPOINT", "localhost:9000").strip().rstrip("/")
    use_tls_env = os.environ.get("S3_USE_TLS")
    if "://" in raw:
        parsed = urlparse(raw)
        endpoint = parsed.netloc or parsed.path
        secure = (
            use_tls_env.lower() != "false"
            if use_tls_env is not None
            else parsed.scheme.lower() == "https"
        )
    else:
        endpoint = raw
        secure = use_tls_env.lower() != "false" if use_tls_env is not None else False
    access_key = (
        os.environ.get("S3_ACCESS_KEY")
        or os.environ.get("S3_APP_USER")
        or os.environ.get("AWS_ACCESS_KEY_ID")  # OpenShell placeholder env in the sandbox
        or "minioadmin"
    )
    secret_key = (
        os.environ.get("S3_SECRET_KEY")
        or os.environ.get("S3_APP_SECRET")
        or os.environ.get("AWS_SECRET_ACCESS_KEY")  # OpenShell placeholder env in the sandbox
        or "minioadmin"
    )
    return Minio(
        endpoint,
        access_key=access_key,
        secret_key=secret_key,
        secure=secure,
    )


def fetch_photo_from_bucket(path: str) -> bytes:
    client = _s3_client()
    response = client.get_object(S3_PHOTOS_BUCKET, path)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def prepare_image_for_inference(
    image_bytes: bytes, path: str, max_dim: int = MAX_INFERENCE_DIMENSION
) -> tuple[bytes, str]:
    """Downscale high-resolution camera photos in memory before vision inference.

    Keeping the longest edge <= 1280px reduces Qwen2.5-VL visual patch tokens
    from ~4,100+ down to ~1,000, avoiding 4096-token context overflows and
    cutting local inference latency while leaving the original photo in the
    `snaps` bucket untouched.
    """
    is_png = path.lower().endswith(".png")
    default_mime = "image/png" if is_png else "image/jpeg"
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            width, height = img.size
            if max(width, height) <= max_dim:
                return image_bytes, default_mime
            img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            if is_png:
                img.save(out, format="PNG", optimize=True)
                return out.getvalue(), "image/png"
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.save(out, format="JPEG", quality=85, optimize=True)
            return out.getvalue(), "image/jpeg"
    except Exception:
        return image_bytes, default_mime


def parse_analysis(text: str) -> dict:
    try:
        return json.loads(JSON_FENCE.sub("", text.strip()))
    except (ValueError, TypeError):
        return {}


def valid_counts(analysis: dict) -> dict:
    def count(value):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        return int(value) if value >= 0 else None

    attendees = count(analysis.get("total_attendees"))
    hands = count(analysis.get("raised_hands"))
    if attendees is not None and hands is not None and hands > attendees:
        hands = None
    caption = analysis.get("caption")
    return {
        "total_attendees": attendees,
        "raised_hands": hands,
        "percentage_with_hands_up": (
            round(hands / attendees * 100, 1)
            if attendees and hands is not None
            else None
        ),
        "caption": caption.strip() if isinstance(caption, str) and caption.strip() else None,
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": AGENT_MODEL,
        "ollama": OLLAMA_BASE_URL,
        "num_ctx": OLLAMA_NUM_CTX,
        "max_inference_dimension": MAX_INFERENCE_DIMENSION,
    }


@app.post("/analyze")
async def analyze(request: AnalyzeRequest):
    if request.image_base64 is not None:
        try:
            raw_image = base64.b64decode(request.image_base64)
        except (ValueError, TypeError):
            return JSONResponse({"error": "invalid base64 image"}, status_code=400)
    else:
        try:
            raw_image = fetch_photo_from_bucket(request.path)
        except Exception as exc:
            logger.error("Failed to fetch %s from bucket %s: %s", request.path, S3_PHOTOS_BUCKET, exc)
            return JSONResponse({"error": "photo not found in storage"}, status_code=404)

    if not raw_image:
        return JSONResponse({"error": "empty image"}, status_code=400)

    image, mime_type = prepare_image_for_inference(raw_image, request.path)

    content = types.Content(
        role="user",
        parts=[
            types.Part.from_bytes(
                data=image,
                mime_type=mime_type,
            ),
            types.Part.from_text(text="Analyze this conference photo."),
        ],
    )
    try:
        session = await runner.session_service.create_session(
            app_name=runner.app_name, user_id="crowd-counter"
        )
        text = ""
        async for event in runner.run_async(
            user_id="crowd-counter",
            session_id=session.id,
            new_message=content,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                text = "".join(part.text or "" for part in event.content.parts)
    except Exception as exc:
        logger.error("Agent model execution failed for %s: %s", request.path, exc)
        return JSONResponse(
            {"error": "the model could not produce a valid analysis"},
            status_code=502,
        )

    analysis = valid_counts(parse_analysis(text))
    if analysis["total_attendees"] is None and analysis["caption"] is None:
        return JSONResponse(
            {"error": "the model could not produce a valid analysis"},
            status_code=502,
        )
    return analysis


def main() -> None:
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
