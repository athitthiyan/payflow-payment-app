import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { FailureComponent } from './failure.component';

describe('FailureComponent', () => {
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
  });
});
