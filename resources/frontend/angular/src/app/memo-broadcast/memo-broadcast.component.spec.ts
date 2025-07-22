import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MemoBroadcastComponent } from './memo-broadcast.component';

describe('MemoBroadcastComponent', () => {
  let component: MemoBroadcastComponent;
  let fixture: ComponentFixture<MemoBroadcastComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MemoBroadcastComponent]
    })
      .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MemoBroadcastComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
}); 