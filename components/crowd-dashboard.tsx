"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowUpRight, Camera, Check, ChevronDown, Copy, Hand, ImagePlus, LoaderCircle, Moon, RefreshCw, Sun, Trash2, Upload, Users } from "lucide-react"
import { useTheme } from "./theme-provider"
import { exceedsMaxDimension, imageExtension, MAX_DIMENSION, MAX_FILES, MAX_IMAGE_BYTES, Photo, sumKnown } from "@/lib/crowd"
import { PROMPT_PATTERN } from "@/lib/crowd"

type FileInput = FileList | File[]
type ImageResult = { photos: Photo[]; prompt: string; analysisWarning?: string | null }
const SessionMap = dynamic(() => import("./session-map"), { ssr: false, loading: () => <p role="status">Loading session map...</p> })
const tips = ["Estimating visible attendees and raised hands.", "Generating a caption for each photo.", "AI estimates may miss people who are obscured.", "Each photo is analyzed independently."]
const display = (value: number | null | undefined) => value == null ? "Unavailable" : value.toLocaleString()
const source = (photo: Photo) => `/api/stage-image?path=${encodeURIComponent(photo.path)}`

async function fetchJson(url: string, options?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...options })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || "Request failed. Please retry.")
    return result
}

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
    if (typeof createImageBitmap === "function") {
        try {
            const bitmap = await createImageBitmap(file)
            const dimensions = { width: bitmap.width, height: bitmap.height }
            bitmap.close()
            return dimensions
        } catch (_error) { /* fall back to Image below */ }
    }
    const url = URL.createObjectURL(file)
    try {
        return await new Promise<{ width: number; height: number }>((resolve, reject) => {
            const image = new Image()
            image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
            image.onerror = () => reject(new Error("Could not read image dimensions."))
            image.src = url
        })
    } finally { URL.revokeObjectURL(url) }
}

function PhotoImage({ photo, thumbnail = false }: { photo: Photo; thumbnail?: boolean }) {
    const [loaded, setLoaded] = useState(false)
    const [failed, setFailed] = useState(false)
    return <div className={thumbnail ? "thumbnail" : "photo-frame"}>
        {!loaded && !failed && <div className="image-wait"><LoaderCircle className="spin" size={thumbnail ? 16 : 28} /><span className={thumbnail ? "sr-only" : ""}>Loading photo</span></div>}
        {failed ? <div className="image-wait"><Camera /><span>Photo unavailable</span></div> : <img src={source(photo)} alt={thumbnail ? "" : photo.caption || "Conference session photo"} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} style={{ opacity: loaded ? 1 : 0 }} />}
    </div>
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState(false)
    return <button className="icon-button" title={error ? "Copy failed" : copied ? "Copied" : "Copy"} aria-label={error ? "Copy failed; retry" : copied ? "Copied" : "Copy"} onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setError(false); setTimeout(() => setCopied(false), 1800) }
        catch (_error) { setError(true) }
    }}>{copied ? <Check size={16} /> : <Copy size={16} />}{error && <span>Copy failed</span>}</button>
}

export function CrowdDashboard() {
    const { resolvedTheme, setTheme } = useTheme()
    const client = useQueryClient()
    const fileInput = useRef<HTMLInputElement>(null)
    const confirmation = useRef<HTMLDialogElement>(null)
    const [selectedPath, setSelectedPath] = useState<string | null>(null)
    const [isUploading, setUploading] = useState(false)
    const [isAnalyzing, setAnalyzing] = useState(false)
    const [isResetting, setResetting] = useState(false)
    const [uploadCount, setUploadCount] = useState(0)
    const [progress, setProgress] = useState(0)
    const [elapsed, setElapsed] = useState(0)
    const [dragging, setDragging] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [locationWarning, setLocationWarning] = useState<string | null>(null)
    const [resetToken, setResetToken] = useState<string | null>(null)
    const [resetWarning, setResetWarning] = useState<string | null>(null)
    const [locationsLoading, setLocationsLoading] = useState(false)
    const count = useQuery<{ count: number }>({ queryKey: ["file-count"], queryFn: () => fetchJson("/api/file-count"), retry: false, refetchOnWindowFocus: false })
    const images = useQuery<ImageResult>({ queryKey: ["images"], queryFn: () => fetchJson("/api/images"), enabled: count.isSuccess, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false })
    const analyzing = isAnalyzing || images.isFetching
    const busy = isUploading || analyzing || isResetting || count.isPending
    const photos = images.data?.photos ?? []
    const selected = photos.find(photo => photo.path === selectedPath) ?? photos[0]
    const knownAttendees = photos.filter(photo => photo.attendees !== null).length
    const knownHands = photos.filter(photo => photo.hands !== null).length

    useEffect(() => {
        if (!analyzing) { setElapsed(0); return }
        const started = Date.now()
        const interval = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
        return () => clearInterval(interval)
    }, [analyzing])

    async function refreshAnalysis() {
        setAnalyzing(true)
        try {
            const result = await count.refetch({ throwOnError: true })
            if ((result.data?.count ?? 0) > 0) await client.refetchQueries({ queryKey: ["images"], type: "all" }, { throwOnError: true })
            else client.setQueryData<ImageResult>(["images"], { photos: [], prompt: PROMPT_PATTERN })
        } finally { setAnalyzing(false) }
    }

    async function upload(input: FileInput) {
        if (busy) return
        const files = Array.from(input)
        if (!files.length) return
        setError(null)
        if (files.length > MAX_FILES || files.some(file => !imageExtension(file.name) || file.size > MAX_IMAGE_BYTES || !file.size)) {
            setError("Choose up to 4 JPG, JPEG or PNG photos, each no larger than 3.75 MB.")
            return
        }
        const oversized: string[] = []
        for (const file of files) {
            try {
                const { width, height } = await imageDimensions(file)
                if (exceedsMaxDimension(width, height)) oversized.push(`${file.name} is ${width}×${height} px`)
            } catch (_error) { /* unreadable files are rejected by the server */ }
        }
        if (oversized.length) {
            setError(`${oversized.join("; ")}. Max is ${MAX_DIMENSION.toLocaleString()} × ${MAX_DIMENSION.toLocaleString()} px.`)
            return
        }
        setUploading(true); setUploadCount(files.length); setProgress(0)
        try {
            const form = new FormData()
            files.forEach(file => form.append("files", file))
            const result = await new Promise<{ uploaded: string[]; locationWarning?: string | null }>((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                xhr.open("POST", "/api/upload"); xhr.setRequestHeader("x-crowd-action", "1")
                xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)) }
                xhr.onerror = () => reject(new Error("Upload connection failed. Please retry."))
                xhr.onload = () => {
                    try {
                        const payload = JSON.parse(xhr.responseText)
                        if (xhr.status >= 200 && xhr.status < 300) resolve(payload)
                        else reject(new Error(payload.error || "Upload failed."))
                    } catch (_error) { reject(new Error("Upload failed. Please retry.")) }
                }
                xhr.send(form)
            })
            setSelectedPath(result.uploaded[0]); setAnalyzing(true); setUploading(false)
            setLocationWarning(result.locationWarning ?? null)
            await refreshAnalysis()
        } catch (problem) { setError(problem instanceof Error ? problem.message : "Upload failed.") }
        finally { setUploading(false); setAnalyzing(false); if (fileInput.current) fileInput.current.value = "" }
    }

    async function reset() {
        confirmation.current?.close(); setResetting(true); setError(null)
        try {
            const result = await fetchJson("/api/reset", { method: "POST", headers: { "Content-Type": "application/json", "x-crowd-action": "1" }, body: JSON.stringify({ confirm: "CLEAR ALL PHOTOS", retryToken: resetToken }) })
            setResetToken(result.retryToken ?? null)
            setResetWarning(result.warning ?? null)
            if (result.photosCleared) {
                client.setQueryData<ImageResult>(["images"], { photos: [], prompt: PROMPT_PATTERN })
                setSelectedPath(null)
                setLocationWarning(null)
            }
            await client.refetchQueries({ queryKey: ["file-count"] }, { throwOnError: true })
        } catch (problem) { setError(problem instanceof Error ? problem.message : "Clear failed.") }
        finally { setResetting(false) }
    }

    async function refreshLocations() {
        setLocationsLoading(true)
        try {
            const result = await fetchJson("/api/locations")
            client.setQueryData<ImageResult>(["images"], current => current ? {
                ...current, locationWarning: result.locationWarning ?? null,
                photos: current.photos.map(photo => ({ ...photo, ...(result.locations.find((location: Photo) => location.path === photo.path) ?? {}) }))
            } : current)
        } catch (_error) { setLocationWarning("Location refresh failed. Photo analysis is unchanged.") }
        finally { setLocationsLoading(false) }
    }

    return <div className="app-shell">
        <header className="topbar"><a className="brand" href="/"><img src="/icon.svg" alt="" width="36" height="36" /><span>Smart Crowd Counter<small>CONFERENCE PHOTO LAB</small></span></a><div className="header-actions"><span className="powered">Powered by Google ADK + Ollama</span><button className="icon-button" aria-label={resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? <Sun size={20} /> : <Moon size={20} />}</button></div></header>
        <main>
            <section className="intro"><div><p className="eyebrow">A ROOM FULL OF INSIGHT</p><h1>Every photo tells<br />a crowd story.</h1><p className="intro-copy">Attendees, raised hands, and the moments in between.</p></div><div className="intro-mark" aria-hidden="true"><Users size={72} strokeWidth={1} /><ArrowUpRight size={28} /></div></section>
            <input ref={fileInput} className="sr-only" type="file" multiple accept=".jpg,.jpeg,.png,.JPG,.JPEG,.PNG" aria-label="Select conference photos" onChange={event => { if (event.target.files) void upload(event.target.files) }} />
            <button className={`dropzone ${dragging ? "dragging" : ""}`} disabled={busy} onClick={() => fileInput.current?.click()} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files) }}>
                <span className="upload-symbol"><Upload size={25} /></span><span className="drop-copy"><strong>Drop your session photos here</strong><span>JPG / JPEG / PNG · Up to 4 at once · 3.75 MB each · Max 8000 × 8000 px</span></span><span className="browse">Browse photos <ImagePlus size={18} /></span>
            </button>
            {busy && <section className="status-banner" role="status" aria-live="polite"><LoaderCircle className="spin" size={20} /><div><strong>{isResetting ? "Clearing photos..." : isUploading ? `Uploading ${uploadCount} photos... ${progress}%` : `Analyzing photos... ${elapsed}s`}</strong><p>{isResetting ? "Clearing the shared photo library." : isUploading ? progress === 100 ? "Storing photos in MinIO..." : "Sending photos securely to MinIO." : tips[Math.floor(elapsed / 8) % tips.length]}</p></div>{isUploading && <progress max="100" value={progress} aria-label="Upload progress" />}</section>}
            {(error || count.error || images.error) && <section className="error-banner" role="alert"><span>{error || count.error?.message || images.error?.message}</span><button className="icon-button" aria-label="Retry loading photos" disabled={busy} onClick={() => { setError(null); void refreshAnalysis().catch(problem => setError(problem.message)) }}><RefreshCw size={18} /></button></section>}
            <section className="metrics-strip" aria-label="Photo summary">
                <div><span><Camera size={17} /> Photos</span><strong>{count.isPending ? "..." : count.error ? "Unavailable" : display(count.data?.count ?? 0)}</strong><small>In the shared collection</small></div>
                <div><span><Users size={17} /> Attendee estimates</span><strong>{display(sumKnown(photos, "attendees"))}</strong><small>{knownAttendees} of {photos.length} photos available</small></div>
                <div><span><Hand size={17} /> Raised-hand estimates</span><strong>{display(sumKnown(photos, "hands"))}</strong><small>{knownHands} of {photos.length} photos available</small></div>
                <p className="estimate-note">AI estimates, not attendance records.<br />Totals across photos are <strong>not unique attendees.</strong></p>
            </section>
            <div className="section-heading"><h2>Session photos <span>{photos.length.toString().padStart(2, "0")}</span></h2><div className="toolbar"><button className="icon-button" disabled={busy || count.isPending} title="Re-analyze photos" aria-label="Re-analyze photos" onClick={() => void refreshAnalysis().catch(problem => setError(problem.message))}><RefreshCw size={18} /></button><button className="icon-button danger" title="Clear all photos" aria-label="Clear all photos" disabled={busy || !count.data?.count} onClick={() => confirmation.current?.showModal()}><Trash2 size={18} /></button></div></div>
            {!photos.length ? analyzing || count.isPending ? <div className="skeleton-layout" aria-label="Loading photo analysis"><div className="skeleton" /><div className="skeleton" /></div> : <section className="empty-state"><Camera size={44} strokeWidth={1.2} /><h3>Your next session starts here.</h3><p>No analyzed photos yet.</p><button className="primary-button" disabled={busy} onClick={() => fileInput.current?.click()}><ImagePlus size={18} /> Add session photos</button></section> : <section className="photo-workspace" aria-busy={analyzing}>
                <div className="photo-list"><table><thead><tr><th>Photo</th><th>Attendees</th><th>Hands up</th></tr></thead><tbody>{photos.map((photo, index) => <tr key={photo.path} className={selected?.path === photo.path ? "selected" : ""}><td><button className="photo-select" aria-pressed={selected?.path === photo.path} onClick={() => setSelectedPath(photo.path)}><PhotoImage photo={photo} thumbnail /><span><strong>Session {String(index + 1).padStart(2, "0")}</strong><small title={photo.path}>{photo.path}</small></span></button></td><td>{display(photo.attendees)}</td><td>{photo.percentage === null ? "Unavailable" : `${photo.percentage}%`}</td></tr>)}</tbody></table></div>
                {selected && <article className="photo-detail" key={selected.path}><div className="detail-title"><h3>Selected photo</h3><span className="estimate-tag">AI ESTIMATE</span></div><PhotoImage photo={selected} /><p className="caption">{selected.caption || "Caption unavailable."}</p><div className="detail-metrics"><div><span>Visible attendees</span><strong>{display(selected.attendees)}</strong><span>Raised hands</span><strong>{display(selected.hands)}</strong></div><div className="donut-block"><div className="donut" role="img" aria-label={selected.percentage === null ? "Hands-up percentage unavailable" : `${selected.percentage}% of visible attendees have raised hands`} style={{ background: `conic-gradient(var(--teal) ${(selected.percentage ?? 0) * 3.6}deg, var(--line) 0deg)` }}><div><strong>{selected.percentage === null ? "N/A" : `${selected.percentage}%`}</strong><span>HANDS UP</span></div></div><small>{selected.percentage === null ? "Undefined or unavailable" : "Share of visible attendees"}</small></div></div><p className="detail-note">Estimates can be inaccurate. Hands up is not a general measure of engagement.</p></article>}
            </section>}
            {resetWarning && <section className="error-banner" role="alert">{resetWarning}<button className="secondary-button" disabled={busy} onClick={() => void reset()}>Retry cleanup</button></section>}
            <section className="map-section"><div className="section-heading"><h2>Session map</h2><button className="icon-button" aria-label="Refresh locations only" disabled={locationsLoading || busy} onClick={() => void refreshLocations()}><RefreshCw size={18} /></button></div>
                {(locationWarning || images.data?.analysisWarning) && <p className="error-banner" role="alert">{locationWarning || images.data?.analysisWarning}</p>}
                {locationsLoading || analyzing ? <p role="status">Loading locations...</p> : <SessionMap photos={photos} selectedPath={selected?.path} onSelect={setSelectedPath} />}
            </section>
            <details className="under-hood"><summary><span>Under the hood</span><ChevronDown size={18} /></summary><div className="code-columns"><section><div className="code-heading"><h3>Agent analysis pattern</h3><CopyButton text={images.data?.prompt || PROMPT_PATTERN} /></div><pre>{images.data?.prompt || PROMPT_PATTERN}</pre></section><section><div className="code-heading"><h3>Selected result</h3>{selected && <CopyButton text={JSON.stringify(selected, null, 2)} />}</div><pre>{selected ? JSON.stringify(selected, null, 2) : "No photo selected."}</pre></section></div></details>
            <footer><span>SMART CROWD COUNTER</span><span>Google ADK / Ollama Vision</span><span>© 2026 Kamesh Sampath · Apache-2.0</span></footer>
        </main>
        <dialog ref={confirmation} className="confirm-dialog"><h2>Clear all session photos?</h2><p>This permanently removes every photo from the shared collection for all app users. This cannot be undone.</p><div><button className="secondary-button" autoFocus onClick={() => confirmation.current?.close()}>Cancel</button><button className="primary-button destructive" onClick={() => void reset()}><Trash2 size={17} /> Clear all photos</button></div></dialog>
    </div>
}