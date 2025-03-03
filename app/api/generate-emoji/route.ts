import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const MAX_DESCRIPTION_LENGTH = 200;

// Define the request schema using Zod
const requestSchema = z.object({
  svgKey: z.string().regex(/^[a-z]+\/[a-z0-9\-]+(?:\-[a-z0-9]+)*(?:\-[0-9a-f]{4})*$/i, 
    "Invalid SVG key format. Expected format: 'category/emoji-id' (e.g. 'activities/1f3a0')"),
  description: z.string().min(1).max(MAX_DESCRIPTION_LENGTH),
});

// Initialize the Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export async function POST(request: NextRequest) {
  console.log('API route called');
  try {
    // Parse the request body
    const body = await request.json();
    console.log('Request body:', JSON.stringify(body).substring(0, 100) + '...');
    
    // Validate the request body against the schema
    const result = requestSchema.safeParse(body);
    
    if (!result.success) {
      console.error('Invalid request body:', result.error.format());
      return NextResponse.json(
        { error: 'Invalid request body', details: result.error.format() },
        { status: 400 }
      );
    }
    
    const { svgKey, description } = result.data;
    console.log('Validated request data:', { 
      svgKey, 
      description 
    });
    
    // Read SVG file from local assets
    const svgPath = path.join(process.cwd(), 'public', 'assets', `${svgKey}.svg`);
    
    let svgContent;
    try {
      svgContent = fs.readFileSync(svgPath, 'utf8');
      console.log('Read SVG file:', svgPath);
    } catch (error) {
      console.error('Error reading SVG file:', error);
      return NextResponse.json(
        { error: 'Failed to read SVG file', details: `SVG key: ${svgKey}` },
        { status: 404 }
      );
    }
    
    // Create the prompt for Claude
    const prompt = `
You are an expert SVG artist. I want you to create a modified version of the following SVG emoji:

\`\`\`svg
${svgContent}
\`\`\`

Modification request: ${description}

Please create a new SVG emoji based on the original one, but modified according to the request.
The SVG should:
1. Be simple and clean
2. Maintain the same general style as the original
3. Have the same viewBox, width, and height attributes
4. Only include the SVG code, no explanations or markdown

Return ONLY the SVG code, nothing else.
`;

    console.log('Calling Claude API with prompt:', prompt.substring(0, 100) + '...');
    
    // Call the Claude API
    const message = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract the SVG content from the response
    let svgResponse = '';
    
    // Check if the response has content blocks
    if (message.content && message.content.length > 0) {
      const contentBlock = message.content[0];
      
      // Check if the content block is a text block
      if (contentBlock.type === 'text') {
        svgResponse = contentBlock.text;
      } else {
        console.error('Unexpected content block type:', contentBlock.type);
        return NextResponse.json(
          { error: 'Unexpected response format from Claude API' },
          { status: 500 }
        );
      }
    } else {
      console.error('No content in Claude API response');
      return NextResponse.json(
        { error: 'No content in Claude API response' },
        { status: 500 }
      );
    }
    
    console.log('Claude API response:', svgResponse.substring(0, 100) + '...');
    
    // Return the SVG content
    return NextResponse.json({ svg: svgResponse });
    
  } catch (error) {
    console.error('Error generating emoji:', error);
    return NextResponse.json(
      { error: 'Failed to generate emoji' },
      { status: 500 }
    );
  }
}
