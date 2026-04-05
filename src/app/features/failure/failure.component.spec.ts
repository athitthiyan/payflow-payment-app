import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { FailureComponent } from './failure.component';

describe('FailureComponent', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-05T09:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FailureComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) =>
                  (
                    {
                      reason: 'Card was declined',
                      booking_id: '14',
                      hold_expires_at: '2026-04-05T09:02:00.000Z',
                    } as Record<string, string>
                  )[key] ?? null,
              },
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('reads failure context from query params', () => {
    const fixture = TestBed.createComponent(FailureComponent);
    const component = fixture.componentInstance;

    component.ngOnInit();

    expect(component.reason).toBe('Card was declined');
    expect(component.bookingId).toBe('14');
    expect(component.holdExpiresAt).toBe('2026-04-05T09:02:00.000Z');
    expect(component.holdSecondsLeft).toBe(120);
  });

  it('counts down the hold timer and stops at zero', () => {
    const fixture = TestBed.createComponent(FailureComponent);
    const component = fixture.componentInstance;

    component.ngOnInit();
    jest.advanceTimersByTime(30_000);

    expect(component.holdMinutes()).toBe('01');
    expect(component.holdSecondsPad()).toBe('30');

    jest.advanceTimersByTime(90_000);

    expect(component.holdSecondsLeft).toBe(0);
  });

  it('keeps default values when query params are missing', async () => {
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [FailureComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: () => null,
              },
            },
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FailureComponent);
    const component = fixture.componentInstance;

    component.ngOnInit();

    expect(component.reason).toBe('Your payment could not be processed.');
    expect(component.bookingId).toBe('');
    expect(component.holdExpiresAt).toBe('');
    expect(component.holdSecondsLeft).toBe(0);
  });

  it('cleans up the countdown interval on destroy', () => {
    const fixture = TestBed.createComponent(FailureComponent);
    const component = fixture.componentInstance;

    component.ngOnInit();
    component.ngOnDestroy();

    expect((component as any).countdownInterval).toBeNull();
  });
});
