import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('starts with no toasts', () => {
    expect(service.toasts()).toEqual([]);
  });

  it('success() adds a success toast with the given message', () => {
    service.success('Équipe créée.');
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].type).toBe('success');
    expect(service.toasts()[0].message).toBe('Équipe créée.');
  });

  it('error() adds an error toast', () => {
    service.error('Une erreur est survenue.');
    expect(service.toasts()[0].type).toBe('error');
  });

  it('info() adds an info toast', () => {
    service.info('Info.');
    expect(service.toasts()[0].type).toBe('info');
  });

  it('assigns increasing ids across calls', () => {
    service.success('Un');
    service.success('Deux');
    const [first, second] = service.toasts();
    expect(second.id).toBeGreaterThan(first.id);
  });

  it('dismiss() removes only the matching toast', () => {
    service.success('Garder');
    service.success('Retirer');
    const toRemove = service.toasts()[1].id;
    service.dismiss(toRemove);
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].message).toBe('Garder');
  });

  it('auto-dismisses a success/info toast after 4s but not before', () => {
    jasmine.clock().install();
    service.success('Auto');
    expect(service.toasts().length).toBe(1);
    jasmine.clock().tick(3999);
    expect(service.toasts().length).toBe(1);
    jasmine.clock().tick(1);
    expect(service.toasts().length).toBe(0);
  });

  it('auto-dismisses an error toast after 6s, later than success', () => {
    jasmine.clock().install();
    service.error('Auto-error');
    jasmine.clock().tick(4000);
    expect(service.toasts().length).toBe(1);
    jasmine.clock().tick(2000);
    expect(service.toasts().length).toBe(0);
  });
});
