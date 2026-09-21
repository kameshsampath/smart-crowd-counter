import sharp from "sharp"
import { imageExtension, MAX_DIMENSION, MAX_IMAGE_BYTES } from "./crowd"

export async function validateImage(name: string, bytes: Buffer) {
    const extension = imageExtension(name)
    if (!extension) throw new Error("Only JPG, JPEG and PNG files are supported.")
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Each image must be between 1 byte and 3.75 MB.")
    const metadata = await sharp(bytes, { limitInputPixels: MAX_DIMENSION * MAX_DIMENSION, failOn: "warning" }).metadata()
    if (!metadata.width || !metadata.height || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
        throw new Error("Images must not exceed 8000 pixels on either dimension.")
    }
    if ((extension === "png" ? "png" : "jpeg") !== metadata.format || (metadata.pages ?? 1) > 1) {
        throw new Error("File contents must match a single-frame JPG, JPEG or PNG image.")
    }
    await sharp(bytes, { limitInputPixels: MAX_DIMENSION * MAX_DIMENSION, failOn: "warning" }).stats()
    return extension
}