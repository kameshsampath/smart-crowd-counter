"use client";

import { useState, useCallback } from "react";

interface FileUploaderProps {
    onUploadComplete: (uploadedCount: number) => void;
    disabled?: boolean;
}

export default function FileUploader({ onUploadComplete, disabled }: FileUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState<{
        type: "success" | "error";
        message: string;
    } | null>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            const files = Array.from(e.dataTransfer.files);
            uploadFiles(files);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files || []);
            if (files.length) uploadFiles(files);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    async function uploadFiles(files: File[]) {
        const validFiles = files.filter((f) =>
            ["image/jpeg", "image/png", "image/jpg"].includes(f.type)
        );

        if (!validFiles.length) {
            setStatus({
                type: "error",
                message: "No valid files. Only JPG, JPEG, PNG are accepted.",
            });
            return;
        }

        setUploading(true);
        setStatus(null);

        const formData = new FormData();
        validFiles.forEach((f) => formData.append("files", f));

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();

            if (!res.ok) {
                setStatus({ type: "error", message: data.error || "Upload failed" });
            } else {
                setStatus({
                    type: "success",
                    message: `Uploaded ${data.uploaded}/${data.total} files successfully`,
                });
                onUploadComplete(data.uploaded);
            }
        } catch {
            setStatus({ type: "error", message: "Network error during upload" });
        } finally {
            setUploading(false);
        }
    }

    const isDisabled = disabled || uploading;

    return (
        <div className="space-y-3">
            <div
                onDragOver={isDisabled ? undefined : handleDragOver}
                onDragLeave={isDisabled ? undefined : handleDragLeave}
                onDrop={isDisabled ? undefined : handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDisabled
                    ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
                    : isDragging
                        ? "border-blue-500 bg-blue-50 cursor-pointer"
                        : "border-gray-300 hover:border-gray-400 cursor-pointer"
                    }`}
            >
                <input
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                    disabled={isDisabled}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="text-gray-500">
                        {uploading ? (
                            <p className="text-blue-600 font-medium">Uploading...</p>
                        ) : (
                            <>
                                <p className="text-lg font-medium">
                                    Drop conference photos here
                                </p>
                                <p className="text-sm mt-1">or click to select files</p>
                                <p className="text-xs mt-2 text-gray-400">
                                    JPG, JPEG, PNG accepted
                                </p>
                            </>
                        )}
                    </div>
                </label>
            </div>

            {status && (
                <div
                    className={`text-sm px-4 py-2 rounded ${status.type === "success"
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                        }`}
                >
                    {status.message}
                </div>
            )}
        </div>
    );
}
