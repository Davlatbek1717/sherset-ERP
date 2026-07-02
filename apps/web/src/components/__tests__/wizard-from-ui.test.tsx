import { renderWithProviders, screen, userEvent } from '@/test-utils';
import { Wizard, type WizardStep } from '@moysklad/ui';
/**
 * Wizard (from @moysklad/ui) tests — multi-step wizard chrome used by
 * the import wizard, onboarding flows, complex create dialogs.
 *
 * Tests guard the stepper rendering (done/active/pending states), the
 * active-step body + description, the Cancel/Back/Next button layout
 * (Back hidden on step 0, finishVariant on terminal step), the index
 * clamping (negative/over-max), and the optional clickable steps.
 */
import { describe, expect, it, vi } from 'vitest';

const STEPS: WizardStep[] = [
  { key: 'upload', label: 'Yuklash' },
  { key: 'columns', label: 'Ustunlar' },
  { key: 'review', label: 'Ko’rib chiqish' },
];

describe('Wizard', () => {
  describe('stepper rendering', () => {
    it('renders one button per step', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={0}>
          <div>Body</div>
        </Wizard>,
      );
      expect(screen.getByTestId('wizard-step-upload')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-step-columns')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-step-review')).toBeInTheDocument();
    });

    it('renders each step label as visible text', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={0}>
          <div>Body</div>
        </Wizard>,
      );
      expect(screen.getByText('Yuklash')).toBeInTheDocument();
      expect(screen.getByText('Ustunlar')).toBeInTheDocument();
      expect(screen.getByText('Ko’rib chiqish')).toBeInTheDocument();
    });

    it('active step has aria-current="step"', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={1}>
          <div>Body</div>
        </Wizard>,
      );
      expect(screen.getByTestId('wizard-step-columns')).toHaveAttribute('aria-current', 'step');
      expect(screen.getByTestId('wizard-step-upload')).not.toHaveAttribute('aria-current', 'step');
    });

    it('done steps render a "✓" inside the circle', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={2}>
          <div>Body</div>
        </Wizard>,
      );
      // Steps 0 and 1 are done
      expect(screen.getByTestId('wizard-step-upload').textContent).toBe('✓');
      expect(screen.getByTestId('wizard-step-columns').textContent).toBe('✓');
      // Active step shows "3" (index+1)
      expect(screen.getByTestId('wizard-step-review').textContent).toBe('3');
    });

    it('pending steps show their (index+1) number', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={0}>
          <div>Body</div>
        </Wizard>,
      );
      expect(screen.getByTestId('wizard-step-upload').textContent).toBe('1');
      expect(screen.getByTestId('wizard-step-columns').textContent).toBe('2');
      expect(screen.getByTestId('wizard-step-review').textContent).toBe('3');
    });
  });

  describe('active step body', () => {
    it('renders the children inside the body', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={0}>
          <div data-test-id="my-body">Step body</div>
        </Wizard>,
      );
      expect(screen.getByTestId('my-body')).toBeInTheDocument();
    });

    it('renders the active step description above the body', () => {
      const stepsWithDescr: WizardStep[] = [
        { ...STEPS[0]!, description: 'Upload your file' },
        ...STEPS.slice(1),
      ];
      renderWithProviders(
        <Wizard steps={stepsWithDescr} activeIndex={0}>
          <div>Body</div>
        </Wizard>,
      );
      expect(screen.getByText('Upload your file')).toBeInTheDocument();
    });

    it('does NOT show description from inactive steps', () => {
      const stepsWithDescr: WizardStep[] = [
        STEPS[0]!,
        { ...STEPS[1]!, description: 'Active-step-only descr' },
        STEPS[2]!,
      ];
      renderWithProviders(
        <Wizard steps={stepsWithDescr} activeIndex={0}>
          <div>Body</div>
        </Wizard>,
      );
      // Step 1 is not active → its description is NOT shown
      expect(screen.queryByText('Active-step-only descr')).toBeNull();
    });
  });

  describe('index clamping', () => {
    it('clamps activeIndex < 0 to 0', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={-5}>
          <div>Body</div>
        </Wizard>,
      );
      // Step 0 should be active
      expect(screen.getByTestId('wizard-step-upload')).toHaveAttribute('aria-current', 'step');
    });

    it('clamps activeIndex >= steps.length to last index', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={99}>
          <div>Body</div>
        </Wizard>,
      );
      expect(screen.getByTestId('wizard-step-review')).toHaveAttribute('aria-current', 'step');
    });
  });

  describe('footer buttons', () => {
    it('does NOT render footer when no Cancel/Back/Next', () => {
      const { container } = renderWithProviders(
        <Wizard steps={STEPS} activeIndex={0}>
          <div>Body</div>
        </Wizard>,
      );
      // Footer would be the only sibling of the body — its absence is the only sibling check
      expect(container.querySelector('[data-test-id="wizard-cancel"]')).toBeNull();
      expect(container.querySelector('[data-test-id="wizard-next"]')).toBeNull();
      expect(container.querySelector('[data-test-id="wizard-back"]')).toBeNull();
    });

    it('renders Cancel when onCancel provided', async () => {
      const onCancel = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={0} onCancel={onCancel}>
          <div>Body</div>
        </Wizard>,
      );
      const btn = screen.getByTestId('wizard-cancel');
      expect(btn).toHaveTextContent('Bekor qilish');
      await user.click(btn);
      expect(onCancel).toHaveBeenCalled();
    });

    it('renders Next when onNext provided + fires on click', async () => {
      const onNext = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={0} onNext={onNext}>
          <div>Body</div>
        </Wizard>,
      );
      const btn = screen.getByTestId('wizard-next');
      expect(btn).toHaveTextContent('Keyingi');
      await user.click(btn);
      expect(onNext).toHaveBeenCalled();
    });

    it('Next disabled when nextDisabled=true', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={0} onNext={vi.fn()} nextDisabled>
          <div>Body</div>
        </Wizard>,
      );
      expect(screen.getByTestId('wizard-next')).toBeDisabled();
    });

    it('Back HIDDEN on step 0', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={0} onBack={vi.fn()} onNext={vi.fn()}>
          <div>Body</div>
        </Wizard>,
      );
      expect(screen.queryByTestId('wizard-back')).toBeNull();
    });

    it('Back rendered + fires on click on step 1+', async () => {
      const onBack = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={1} onBack={onBack} onNext={vi.fn()}>
          <div>Body</div>
        </Wizard>,
      );
      const btn = screen.getByTestId('wizard-back');
      expect(btn).toHaveTextContent('Orqaga');
      await user.click(btn);
      expect(onBack).toHaveBeenCalled();
    });

    it('Back disabled when backDisabled=true', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={1} onBack={vi.fn()} onNext={vi.fn()} backDisabled>
          <div>Body</div>
        </Wizard>,
      );
      expect(screen.getByTestId('wizard-back')).toBeDisabled();
    });

    it('honors custom labels (cancelLabel, backLabel, nextLabel)', () => {
      renderWithProviders(
        <Wizard
          steps={STEPS}
          activeIndex={1}
          onCancel={vi.fn()}
          onBack={vi.fn()}
          onNext={vi.fn()}
          cancelLabel="Cancel"
          backLabel="Back"
          nextLabel="Finish"
        >
          <div>Body</div>
        </Wizard>,
      );
      expect(screen.getByTestId('wizard-cancel')).toHaveTextContent('Cancel');
      expect(screen.getByTestId('wizard-back')).toHaveTextContent('Back');
      expect(screen.getByTestId('wizard-next')).toHaveTextContent('Finish');
    });
  });

  describe('clickable steps', () => {
    it('disabled step circles when stepsClickable=false (default)', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={2} onStepClick={vi.fn()}>
          <div>Body</div>
        </Wizard>,
      );
      // All step circles are disabled
      expect(screen.getByTestId('wizard-step-upload')).toBeDisabled();
      expect(screen.getByTestId('wizard-step-columns')).toBeDisabled();
      expect(screen.getByTestId('wizard-step-review')).toBeDisabled();
    });

    it('past steps clickable when stepsClickable=true', async () => {
      const onStepClick = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={2} stepsClickable onStepClick={onStepClick}>
          <div>Body</div>
        </Wizard>,
      );
      // Step 0 (past) → clickable
      const step0 = screen.getByTestId('wizard-step-upload');
      expect(step0).not.toBeDisabled();
      await user.click(step0);
      expect(onStepClick).toHaveBeenCalledWith(0);
    });

    it('current and future steps NOT clickable even when stepsClickable=true', () => {
      renderWithProviders(
        <Wizard steps={STEPS} activeIndex={1} stepsClickable onStepClick={vi.fn()}>
          <div>Body</div>
        </Wizard>,
      );
      // Active step (1) → not clickable
      expect(screen.getByTestId('wizard-step-columns')).toBeDisabled();
      // Future step (2) → not clickable
      expect(screen.getByTestId('wizard-step-review')).toBeDisabled();
    });
  });

  describe('wrapper testId', () => {
    it('renders the testId attribute on the wrapper', () => {
      const { container } = renderWithProviders(
        <Wizard steps={STEPS} activeIndex={0} testId="my-wizard">
          <div>Body</div>
        </Wizard>,
      );
      expect(container.querySelector('[data-test-id="my-wizard"]')).toBeInTheDocument();
    });
  });
});
