"use client";

import { useState, useEffect } from "react";

interface ImageViewerProps {
    fileName: string | null;
    caption: string | null;
}

export default function ImageViewer({
    fileName,
    caption,
}: ImageViewerProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<Record<string, string | number> | null>(
        null
    );

    useEffect(() => {
        if (!fileName) {
            setImageUrl(null);
            return;
        }

        let parsed: Record<string, string | number>;
        try {
            parsed = typeof fileName === "string" ? JSON.parse(fileName) : fileName;
        } catch {
            setError("Could not parse file metadata");
            return;
        }

        setMetadata(parsed);
        const relativePath = parsed["RELATIVE_PATH"] as string;
        if (!relativePath) {
            setError("No RELATIVE_PATH in file metadata");
            return;
        }

        setLoading(true);
        setError(null);

        fetch(
            `/api/presigned-url?path=${encodeURIComponent(relativePath)}`
        )
            .then((res) => res.json())
            .then((data) => {
                if (data.url) {
                    setImageUrl(data.url);
                } else {
                    setError(data.error || "Failed to get presigned URL");
                }
            })
            .catch(() => setError("Network error fetching image URL"))
            .finally(() => setLoading(false));
    }, [fileName]);

    if (!fileName) {
        return (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-400">
                Select a row to view the image
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg border overflow-hidden">
            <div className="p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Session Image
                </h3>

                {loading && (
                    <div className="h-64 flex items-center justify-center text-gray-400">
                        Loading image...
                    </div>
                )}

                {error && <div className="text-sm text-red-600 p-4">{error}</div>}

                {imageUrl && (
                    <img
                        src={imageUrl}
                        alt={caption || "Conference session"}
                        className="w-full rounded-md object-cover max-h-80"
                    />
                )}

                {caption && (
                    <p className="text-sm text-gray-600 mt-2 italic">{caption}</p>
                )}

                {metadata && (
                    <details className="mt-3">
                        <summary className="text-xs text-gray-500 cursor-pointer">
                            File Details
                        </summary>
                        <div className="text-xs text-gray-500 mt-2 space-y-1">
                            {metadata["CONTENT_TYPE"] && (
                                <p>Type: {String(metadata["CONTENT_TYPE"])}</p>
                            )}
                            {metadata["SIZE"] && (
                                <p>Size: {Number(metadata["SIZE"]).toLocaleString()} bytes</p>
                            )}
                            {metadata["LAST_MODIFIED"] && (
                                <p>Modified: {String(metadata["LAST_MODIFIED"])}</p>
                            )}
                        </div>
                    </details>
                )}
            </div>
        </div>
    );
}
