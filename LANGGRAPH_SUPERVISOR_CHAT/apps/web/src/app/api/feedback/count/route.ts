import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/../../agents/src/shared/db-setup';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mapper = searchParams.get('mapper');
    const field = searchParams.get('field');
    const officeId = searchParams.get('officeId');
    const portalType = searchParams.get('portalType');

    if (!mapper || !field) {
      return NextResponse.json(
        { error: 'mapper and field are required' },
        { status: 400 }
      );
    }

    const pool = getPool();

    let query = `
      SELECT COUNT(*) as count
      FROM feedback_corrections
      WHERE mapper = $1 AND field = $2
    `;
    const values: any[] = [mapper, field];
    let paramCount = 2;

    if (officeId) {
      paramCount++;
      query += ` AND office_id = $${paramCount}`;
      values.push(officeId);
    }

    if (portalType) {
      paramCount++;
      query += ` AND portal_type = $${paramCount}`;
      values.push(portalType);
    }

    const result = await pool.query(query, values);
    const count = parseInt(result.rows[0].count);

    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error fetching correction count:', error);
    return NextResponse.json(
      { error: 'Failed to fetch correction count', count: 0 },
      { status: 500 }
    );
  }
}
