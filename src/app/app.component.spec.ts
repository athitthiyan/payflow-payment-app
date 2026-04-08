import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the payflow header shell', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.sv-header')).not.toBeNull();
    expect(element.textContent).toContain('Stayvora');
    expect(element.textContent).toContain('Pay');
    expect(element.textContent).toContain('Checkout');
    expect(element.textContent).toContain('Transactions');
    expect(element.querySelector('router-outlet')).not.toBeNull();
  });
});
