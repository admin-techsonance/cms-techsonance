import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { companySettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  try {
    const settings = await db.select()
      .from(companySettings)
      .limit(1);

    if (settings.length === 0) {
      return NextResponse.json({ 
        error: 'Company settings not found',
        code: 'SETTINGS_NOT_FOUND' 
      }, { status: 404 });
    }

    return NextResponse.json(settings[0], { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      companyName, 
      email, 
      logoUrl, 
      primaryColor, 
      secondaryColor, 
      phone, 
      address, 
      website, 
      smtpHost, 
      smtpPort, 
      smtpUser, 
      smtpPassword 
    } = body;

    // Check if settings already exist
    const existingSettings = await db.select()
      .from(companySettings)
      .limit(1);

    if (existingSettings.length > 0) {
      return NextResponse.json({ 
        error: 'Company settings already exist. Use PUT to update.',
        code: 'SETTINGS_ALREADY_EXIST' 
      }, { status: 400 });
    }

    // Validate required fields
    if (!companyName || typeof companyName !== 'string' || companyName.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Company name is required',
        code: 'MISSING_COMPANY_NAME' 
      }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Email is required',
        code: 'MISSING_EMAIL' 
      }, { status: 400 });
    }

    // Validate email format
    const normalizedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ 
        error: 'Invalid email format',
        code: 'INVALID_EMAIL_FORMAT' 
      }, { status: 400 });
    }

    // Validate smtpPort if provided
    if (smtpPort !== undefined && smtpPort !== null) {
      const port = parseInt(smtpPort);
      if (isNaN(port) || port < 1 || port > 65535) {
        return NextResponse.json({ 
          error: 'SMTP port must be a valid integer between 1 and 65535',
          code: 'INVALID_SMTP_PORT' 
        }, { status: 400 });
      }
    }

    // Prepare insert data
    const insertData: any = {
      companyName: companyName.trim(),
      email: normalizedEmail,
      updatedAt: new Date().toISOString()
    };

    // Add optional fields if provided
    if (logoUrl !== undefined && logoUrl !== null) insertData.logoUrl = logoUrl.trim();
    if (primaryColor !== undefined && primaryColor !== null) insertData.primaryColor = primaryColor.trim();
    if (secondaryColor !== undefined && secondaryColor !== null) insertData.secondaryColor = secondaryColor.trim();
    if (phone !== undefined && phone !== null) insertData.phone = phone.trim();
    if (address !== undefined && address !== null) insertData.address = address.trim();
    if (website !== undefined && website !== null) insertData.website = website.trim();
    if (smtpHost !== undefined && smtpHost !== null) insertData.smtpHost = smtpHost.trim();
    if (smtpPort !== undefined && smtpPort !== null) insertData.smtpPort = parseInt(smtpPort);
    if (smtpUser !== undefined && smtpUser !== null) insertData.smtpUser = smtpUser.trim();
    if (smtpPassword !== undefined && smtpPassword !== null) insertData.smtpPassword = smtpPassword;

    const newSettings = await db.insert(companySettings)
      .values(insertData)
      .returning();

    return NextResponse.json(newSettings[0], { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      companyName, 
      email, 
      logoUrl, 
      primaryColor, 
      secondaryColor, 
      phone, 
      address, 
      website, 
      smtpHost, 
      smtpPort, 
      smtpUser, 
      smtpPassword 
    } = body;

    // Get existing settings
    const existingSettings = await db.select()
      .from(companySettings)
      .limit(1);

    if (existingSettings.length === 0) {
      return NextResponse.json({ 
        error: 'Company settings not found. Use POST to create initial settings.',
        code: 'SETTINGS_NOT_FOUND' 
      }, { status: 404 });
    }

    const settingsId = existingSettings[0].id;

    // Validate email if provided
    if (email !== undefined && email !== null) {
      if (typeof email !== 'string' || email.trim().length === 0) {
        return NextResponse.json({ 
          error: 'Email cannot be empty',
          code: 'INVALID_EMAIL' 
        }, { status: 400 });
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (!emailRegex.test(normalizedEmail)) {
        return NextResponse.json({ 
          error: 'Invalid email format',
          code: 'INVALID_EMAIL_FORMAT' 
        }, { status: 400 });
      }
    }

    // Validate companyName if provided
    if (companyName !== undefined && companyName !== null) {
      if (typeof companyName !== 'string' || companyName.trim().length === 0) {
        return NextResponse.json({ 
          error: 'Company name cannot be empty',
          code: 'INVALID_COMPANY_NAME' 
        }, { status: 400 });
      }
    }

    // Validate smtpPort if provided
    if (smtpPort !== undefined && smtpPort !== null) {
      const port = parseInt(smtpPort);
      if (isNaN(port) || port < 1 || port > 65535) {
        return NextResponse.json({ 
          error: 'SMTP port must be a valid integer between 1 and 65535',
          code: 'INVALID_SMTP_PORT' 
        }, { status: 400 });
      }
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date().toISOString()
    };

    // Add fields to update if provided
    if (companyName !== undefined && companyName !== null) updateData.companyName = companyName.trim();
    if (email !== undefined && email !== null) updateData.email = email.trim().toLowerCase();
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl ? logoUrl.trim() : null;
    if (primaryColor !== undefined) updateData.primaryColor = primaryColor ? primaryColor.trim() : null;
    if (secondaryColor !== undefined) updateData.secondaryColor = secondaryColor ? secondaryColor.trim() : null;
    if (phone !== undefined) updateData.phone = phone ? phone.trim() : null;
    if (address !== undefined) updateData.address = address ? address.trim() : null;
    if (website !== undefined) updateData.website = website ? website.trim() : null;
    if (smtpHost !== undefined) updateData.smtpHost = smtpHost ? smtpHost.trim() : null;
    if (smtpPort !== undefined) updateData.smtpPort = smtpPort ? parseInt(smtpPort) : null;
    if (smtpUser !== undefined) updateData.smtpUser = smtpUser ? smtpUser.trim() : null;
    if (smtpPassword !== undefined) updateData.smtpPassword = smtpPassword || null;

    const updated = await db.update(companySettings)
      .set(updateData)
      .where(eq(companySettings.id, settingsId))
      .returning();

    return NextResponse.json(updated[0], { status: 200 });
  } catch (error) {
    console.error('PUT error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + (error as Error).message 
    }, { status: 500 });
  }
}