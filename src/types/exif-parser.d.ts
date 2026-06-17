declare module "exif-parser" {
    interface ExifTags {
        GPSLatitude?: number;
        GPSLongitude?: number;
        GPSAltitude?: number;
        DateTimeOriginal?: number;
        Make?: string;
        Model?: string;
        [key: string]: unknown;
    }

    interface ExifResult {
        tags: ExifTags;
    }

    interface ExifParser {
        parse(): ExifResult;
    }

    function create(buffer: Buffer): ExifParser;

    export = { create };
}
