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

  it('แปลข้อความเพดาน target_minutes (bug #42)', () => {
    const msg = friendlyFieldError('must not exceed 350400');
    expect(msg).not.toBe('must not exceed 350400');
    expect(msg).toMatch(/350,?400/);
  });

  it('TEST-F10-11: "must not be in the past" แปลตาม field (end_date ไม่ใช่ "start date")', () => {
    expect(friendlyFields({ end_date: 'must not be in the past' })).toEqual({
      end_date: 'The end date cannot be in the past.',
    });
    expect(friendlyFields({ start_date: 'must not be in the past' })).toEqual({
      start_date: 'The start date cannot be in the past.',
    });
  });

  it('TEST-F10-11: เพดาน target_minutes แปลได้ผ่าน friendlyFields', () => {
    expect(friendlyFields({ target_minutes: 'must not exceed 350400' }).target_minutes).toMatch(/350,400/);
  });

  it('ข้อความที่ไม่รู้จักแสดงตามเดิม และแปลทั้งชุด field ได้', () => {
    expect(friendlyFieldError('something new')).toBe('something new');
    expect(friendlyFields({ minutes: 'integer required' })).toEqual({
      minutes: 'Enter a whole number of minutes.',
    });
  });
});
