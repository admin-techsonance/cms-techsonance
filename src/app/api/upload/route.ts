import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function POST(request: NextRequest) {
    try {
        const data = await request.formData();
        const file: File | null = data.get('file') as unknown as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
            return NextResponse.json({ error: "Invalid file type. Only PDF, JPG, and PNG are allowed." }, { status: 400 });
        }

        // Create unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Sanitize filename
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = uniqueSuffix + '-' + safeName;

        // Save to public/uploads
        const uploadDir = join(process.cwd(), 'public', 'uploads');

        // Create directory if it doesn't exist
        try {
            await mkdir(uploadDir, { recursive: true });
        } catch (e) {
            // Ignore error if directory already exists of course, but recursive: true handles it
        }

        const filepath = join(uploadDir, filename);
        await writeFile(filepath, buffer);

        // Return the URL (relative to public)
        const url = `/uploads/${filename}`;

        return NextResponse.json({ url }, { status: 201 });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: "Upload failed: " + (error as Error).message }, { status: 500 });
    }
}
