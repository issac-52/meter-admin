import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/shared/lib/supabase/server';

// Naver 리버스 지오코딩 API 응답 형식 — 외부 API라 필요한 필드만 최소 검증
const areaSchema = z.object({ name: z.string().optional() }).optional();

const regionSchema = z
  .object({
    area1: areaSchema,
    area2: areaSchema,
    area3: areaSchema,
    area4: areaSchema,
  })
  .optional();

const landSchema = z
  .object({
    type: z.string().optional(),
    name: z.string().optional(),
    number1: z.string().optional(),
    number2: z.string().optional(),
    addition0: z.object({ value: z.string().optional() }).optional(),
  })
  .optional();

const naverReverseGeocodeResponseSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        region: regionSchema,
        land: landSchema,
      }),
    )
    .default([]),
});

type GeocodeResult = z.infer<typeof naverReverseGeocodeResponseSchema>['results'][number];

// 지번(구)주소: 시/도 + 시/군/구 + 읍/면/동 + 리 + (산)번지
function buildJibunAddress(result: GeocodeResult | undefined): string | null {
  if (!result) return null;
  const areas = [result.region?.area1?.name, result.region?.area2?.name, result.region?.area3?.name, result.region?.area4?.name].filter(
    (v): v is string => !!v,
  );
  const land = result.land;
  if (!land?.number1) return areas.join(' ') || null;
  const isMountain = land.type === '2';
  const numberPart = `${isMountain ? '산' : ''}${land.number1}${land.number2 ? `-${land.number2}` : ''}`;
  return [...areas, numberPart].join(' ') || null;
}

// 도로명주소: 시/도 + 시/군/구 + 읍/면/동 + 도로명 + 번지 + (건물명)
function buildRoadAddress(result: GeocodeResult | undefined): string | null {
  if (!result) return null;
  const areas = [result.region?.area1?.name, result.region?.area2?.name, result.region?.area3?.name].filter(
    (v): v is string => !!v,
  );
  const land = result.land;
  if (!land?.name) return areas.join(' ') || null;
  const numberPart = `${land.number1 ?? ''}${land.number2 ? `-${land.number2}` : ''}`;
  const building = land.addition0?.value;
  return [...areas, land.name, numberPart, building].filter((v): v is string => !!v).join(' ');
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lat, lng } = (await request.json()) as { lat?: number; lng?: number };
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Naver API keys not configured' }, { status: 500 });
  }

  const url = `https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${lng},${lat}&output=json&orders=addr,roadaddr`;
  const res = await fetch(url, {
    headers: {
      'x-ncp-apigw-api-key-id': clientId,
      'x-ncp-apigw-api-key': clientSecret,
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return NextResponse.json(
      { error: `Reverse geocoding API error (${res.status})`, detail },
      { status: 500 },
    );
  }

  const json = await res.json();
  const parsed = naverReverseGeocodeResponseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: '리버스 지오코딩 응답 형식이 올바르지 않습니다' }, { status: 502 });
  }

  const addrResult = parsed.data.results.find((r) => r.name === 'addr');
  const roadResult = parsed.data.results.find((r) => r.name === 'roadaddr');

  return NextResponse.json({
    oldAddress: buildJibunAddress(addrResult),
    roadAddress: buildRoadAddress(roadResult),
  });
}
