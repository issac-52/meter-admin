import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createClient } from '@/shared/lib/supabase/server';
import { getUploadPresignedUrl, deleteFromStorage } from '@/shared/lib/r2-storage';

// GET: presigned URL 발급 — 블록별 폴더에 저장, 파일명은 밸브관리번호-슬롯 (수용가와 별개 네임스페이스)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const recordId = searchParams.get('record_id');
  const slot = searchParams.get('slot') as '1' | '2' | null;
  const block = searchParams.get('block');
  const valveNo = searchParams.get('valve_no');
  const contentType = searchParams.get('content_type') ?? 'image/jpeg';

  if (!recordId || !slot || !block || !valveNo) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const rawExt = contentType.split('/')[1] ?? 'jpg';
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  const filePath = `valve/${block}/${valveNo}-${slot}.${ext}`;

  try {
    const presignedUrl = await getUploadPresignedUrl(filePath, contentType);
    return NextResponse.json({ presignedUrl, filePath });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST: 브라우저→R2 직접 업로드 완료 후 DB에 경로 저장
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { record_id, slot, file_path } = (await request.json()) as {
    record_id: number;
    slot: 1 | 2;
    file_path: string;
  };

  if (!record_id || !slot || !file_path) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const admin = createAdminClient();
  const column = slot === 1 ? 'image1_id' : 'image2_id';
  const { error } = await admin
    .from('valve_records')
    .update({ [column]: file_path })
    .eq('id', Number(record_id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ filePath: file_path });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { record_id, slot, file_path } = (await request.json()) as {
    record_id: number;
    slot: 1 | 2;
    file_path: string;
  };

  try {
    await deleteFromStorage(file_path);
  } catch {}

  const admin = createAdminClient();
  const column = slot === 1 ? 'image1_id' : 'image2_id';
  await admin.from('valve_records').update({ [column]: null }).eq('id', record_id);

  return NextResponse.json({ success: true });
}
