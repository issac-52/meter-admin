import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

// Naver 지오코딩 API 응답 형식 — 외부 API라 lat/lng 최소 검증
const naverGeocodeResponseSchema = z.object({
  addresses: z
    .array(
      z.object({
        x: z.coerce.number().finite(), // 경도
        y: z.coerce.number().finite(), // 위도
      }),
    )
    .default([]),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { record_id, address } = (await request.json()) as { record_id: number; address: string };
  if (!record_id || !address) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Naver API keys not configured' }, { status: 500 });
  }

  const url = `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: {
      'x-ncp-apigw-api-key-id': clientId,
      'x-ncp-apigw-api-key': clientSecret,
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Geocoding API error' }, { status: 500 });
  }

  const json = await res.json();
  const parsed = naverGeocodeResponseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: '지오코딩 응답 형식이 올바르지 않습니다' }, { status: 502 });
  }

  const first = parsed.data.addresses[0];
  if (!first) {
    return NextResponse.json({ error: 'No result' }, { status: 404 });
  }

  const lat = first.y;
  const lng = first.x;

  const admin = createAdminClient();
  await admin.from('meter_records').update({ lat, lng }).eq('id', record_id);

  return NextResponse.json({ lat, lng });
}
