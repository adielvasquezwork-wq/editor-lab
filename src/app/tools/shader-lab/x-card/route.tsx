import { ImageResponse } from "next/og"

const size = { height: 630, width: 1200 }

export async function GET(request: Request) {
  const src = new URL("/opengraph-image.jpg?v=2", request.url).toString()

  return new ImageResponse(
    <div style={{ display: "flex", height: size.height, width: size.width }}>
      <img
        alt=""
        height={size.height}
        src={src}
        style={{ height: size.height, width: size.width }}
        width={size.width}
      />
    </div>,
    {
      ...size,
      headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
    }
  )
}
