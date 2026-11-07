import { describe, it, expect } from 'vitest';
import { friendlyFieldError, friendlyFields } from '../lib/messages';

describe('friendlyFieldError (UI polish)', () => {
  it('บอกช่วงที่ถูกต้องเมื่อรู้ template', () => {
    expect(friendlyFieldError('out of template range', { min_value: 10, max_value: 480 })).toBe(
      'Minutes must be between 10 and 480.'
    );
  });

  it('ไม่มี template ก็ยังได้ข้อความที่อ่านรู้เรื่อง', () => {
    expect(friendlyFieldError('out of template range')).toMatch(/outside the range/);
  });

  it('แปลข้อความเทคนิค ไม่เหลือชื่อ field ภายใน', () => {
    expect(friendlyFieldError('must be >= min_value')).not.toMatch(/min_value/);
    expect(friendlyFieldError('must not be before start_date')).not.toMatch(/start_date/);
  });

  it('ข้อความที่ไม่รู้จักแสดงตามเดิม และแปลทั้งชุด field ได้', () => {
    expect(friendlyFieldError('something new')).toBe('something new');
    expect(friendlyFields({ minutes: 'integer required' })).toEqual({
      minutes: 'Enter a whole number of minutes.',
    });
  });
});
