import { ImageResponse } from 'next/og';

// Image metadata
export const alt = 'AnonTweet - Anonymous Social Media Platform';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

// Image generation
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 128,
          background: 'linear-gradient(to bottom right, #1e3a8a, #3b82f6)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontFamily: 'system-ui',
        }}
      >
        <div style={{ fontSize: 140, fontWeight: 'bold', marginBottom: 20 }}>
          AnonTweet
        </div>
        <div style={{ fontSize: 44, opacity: 0.95, textAlign: 'center', padding: '0 40px' }}>
          Post, message, go live &amp; play games — anonymously.
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
