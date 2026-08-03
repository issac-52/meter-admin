import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const block = req.nextUrl.searchParams.get('block') ?? undefined;

  const admin = createAdminClient();
  let query = admin
    .from('valve_records')
    .select('id, block, valve_no, image1_id, image2_id')
    .or('image1_id.not.is.null,image2_id.not.is.null')
    .order('block', { ascending: true })
    .order('valve_no', { ascending: true, nullsFirst: false });

  if (block) query = query.eq('block', block);

  const { data } = await query;
  type Row = { id: number; block: string; valve_no: string | null; image1_id: string | null; image2_id: string | null };
  const records = (data ?? []) as Row[];

  const r2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '') ?? '';

  const images = records.flatMap((r) =>
    ([r.image1_id, r.image2_id] as (string | null)[]).flatMap((imgId) => {
      if (!imgId) return [];
      const filename = imgId.split('/').pop() ?? imgId;
      // 클라이언트가 R2에서 직접 받도록 URL을 포함해 반환 (Vercel bandwidth 절약)
      return [{ path: imgId, filename, url: r2Base ? `${r2Base}/${imgId}` : null }];
    })
  );

  return NextResponse.json(images);
}
