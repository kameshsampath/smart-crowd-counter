"use client";

import { useState, useEffect } from "react";
import { ImageRow } from "./DataTable";

interface ImageViewerProps {
    row: ImageRow;
}

export default function ImageViewer({ row }: ImageViewerProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!row.FILE_NAME) {
            setImageUrl(null);
            return;
        }

        let parsed: Record<string, string | number>;
        try {
            parsed =
                typeof row.FILE_NAME === "string"
                    ? JSON.parse(row.FILE_NAME)
                    : row.FILE_NAME;
        } catch {
            setError("Could not parse file metadata");
            return;
        }

        const relativePath = parsed["RELATIVE_PATH"] as string;
        if (!relativePath) {
            setError("No RELATIVE_PATH in file metadata");
            return;
        }

        setLoading(true);
        setError(null);

        fetch(`/api/presigned-url?path=${encodeURIComponent(relativePath)}`)
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
    }, [row.FILE_NAME]);

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
                        alt={row.CAPTION || "Conference session"}
                        className="w-full rounded-md object-cover max-h-80"
                    />
                )}

                {row.CAPTION && (
                    <p className="text-sm text-gray-600 mt-2 italic">{row.CAPTION}</p>
                )}

                {/* AI-inferred context */}
                {(row.SESSION_TYPE || row.VENUE_DESCRIPTION || row.LOCATION_CLUES || row.LOCATION_NAME) && (
                    <div className="mt-3 space-y-1">
                        {row.LOCATION_NAME && (
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-gray-500">📍</span>
                                <span className="font-medium text-gray-700">
                                    {row.LOCATION_NAME}
                                </span>
                            </div>
                        )}
                        {row.SESSION_TYPE && (
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-gray-500">Session:</span>
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                                    {row.SESSION_TYPE}
                                </span>
                            </div>
                        )}
                        {row.VENUE_DESCRIPTION && (
                            <p className="text-xs text-gray-500">
                                Venue: {row.VENUE_DESCRIPTION}
                            </p>
                        )}
                        {row.LOCATION_CLUES && !row.LOCATION_NAME && (
                            <p className="text-xs text-gray-500">
                                Location: {row.LOCATION_CLUES}
                            </p>
                        )}
                    </div>
                )}

                {/* EXIF metadata */}
                {(row.LATITUDE || row.CAMERA_MAKE || row.TAKEN_AT) && (
                    <details className="mt-3">
                        <summary className="text-xs text-gray-500 cursor-pointer">
                            Camera / EXIF Data
                        </summary>
                        <div className="text-xs text-gray-500 mt-2 space-y-1">
                            {row.LATITUDE && row.LONGITUDE && (
                                <p>
                                    GPS:{" "}
                                    <a
                                        href={`https://www.google.com/maps?q=${row.LATITUDE},${row.LONGITUDE}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 underline"
                                    >
                                        {row.LATITUDE.toFixed(4)}, {row.LONGITUDE.toFixed(4)}
                                    </a>
                                </p>
                            )}
                            {row.CAMERA_MAKE && (
                                <p>
                                    Camera: {row.CAMERA_MAKE}
                                    {row.CAMERA_MODEL ? ` ${row.CAMERA_MODEL}` : ""}
                                </p>
                            )}
                            {row.TAKEN_AT && (
                                <p>Taken: {new Date(row.TAKEN_AT).toLocaleString()}</p>
                            )}
                        </div>
                    </details>
                )}
            </div>
        </div>
    );
}
