import { NextResponse } from "next/server"

const API_BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })

    const data = await response.json()

    return NextResponse.json(data, {
      status: response.status,
    })
  } catch {
    return NextResponse.json(
      {
        message: "Unable to connect to FarmMitra API.",
      },
      {
        status: 502,
      }
    )
  }
}