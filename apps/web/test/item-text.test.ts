import { describe, expect, it } from 'vitest';
import { parseItem } from '../src/lib/item-text.js';

describe('parseItem', () => {
  it('splits a risk into ref, title, meta and quote', () => {
    expect(parseItem('이슈 #12 ERD 확정 (users-teams 관계) — 담당 나 · 이번 주 열림 · 김지민: “ERD 초안 봤어.”')).toEqual({
      ref: '#12', title: 'ERD 확정 (users-teams 관계)', meta: ['담당 나', '이번 주 열림'], quote: { who: '김지민', text: 'ERD 초안 봤어.' },
    });
  });
  it('splits an action into owner, verb, title and when', () => {
    expect(parseItem('나 · PR #8 리뷰하기 (jimin 요청): feat: 로그인 API와 토큰 갱신 — 10월 15일 (목) 캡스톤디자인 중간발표 전', { action: true })).toEqual({
      owner: '나', ref: 'PR #8', verb: '리뷰하기 (jimin 요청)', title: 'feat: 로그인 API와 토큰 갱신', meta: [], when: '10월 15일 (목) 캡스톤디자인 중간발표 전',
    });
    expect(parseItem('나 · 운영체제 과제2 마감 준비 — #2 과제2 보고서 작성 끝내기 (D-2, 10월 5일 (월))', { action: true })).toEqual({
      owner: '나', title: '운영체제 과제2 마감 준비', meta: ['#2 과제2 보고서 작성 끝내기'], when: 'D-2, 10월 5일 (월)',
    });
  });
  it('turns a schedule line into title + time and place', () => {
    expect(parseItem('10월 5일 (월) 오후 06:00 · 캡스톤 팀 회의 (S4-1 팀플실)')).toEqual({ title: '캡스톤 팀 회의', meta: ['(월) 오후 06:00', 'S4-1 팀플실'] });
  });
  it('leaves a plain sentence alone', () => {
    expect(parseItem('일정 확인 필요: "중간발표" — 박교수 메일은 10월 14일, 캘린더는 10월 15일 (목)')).toEqual({ title: '일정 확인 필요: "중간발표"', meta: ['박교수 메일은 10월 14일, 캘린더는 10월 15일 (목)'] });
  });
});
