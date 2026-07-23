import { renderWithProviders, screen } from '@/test-utils';
import {
  Breadcrumb,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  Divider,
  PageHeader,
  Stack,
} from '@moysklad/ui';
/**
 * Layout primitives (from @moysklad/ui) tests — Container, Divider,
 * Stack, Card{Header,Title,Content,Footer}, PageHeader, Breadcrumb.
 *
 * These shells back almost every page in the app — Container wraps
 * the page chrome, PageHeader gives the title strip, Card holds
 * grouped sections, Stack is the universal flex helper, etc.
 */
import { describe, expect, it } from 'vitest';

describe('Container', () => {
  it('renders as <div> with mx-auto + w-full', () => {
    const { container } = renderWithProviders(<Container>X</Container>);
    const div = container.querySelector('div');
    expect(div?.className).toContain('mx-auto');
    expect(div?.className).toContain('w-full');
  });

  it('uses lg (max-w-7xl) by default', () => {
    const { container } = renderWithProviders(<Container>X</Container>);
    const div = container.querySelector('div');
    expect(div?.className).toContain('max-w-7xl');
  });

  it.each([
    ['sm', 'max-w-3xl'],
    ['md', 'max-w-5xl'],
    ['lg', 'max-w-7xl'],
    ['xl', 'max-w-[1400px]'],
    ['full', 'max-w-none'],
  ] as const)('size=%s applies %s', (size, expected) => {
    const { container } = renderWithProviders(<Container size={size}>X</Container>);
    const div = container.querySelector('div');
    expect(div?.className).toContain(expected);
  });

  it('merges user className', () => {
    const { container } = renderWithProviders(<Container className="my-extra">X</Container>);
    const div = container.querySelector('div');
    expect(div?.className).toContain('my-extra');
    expect(div?.className).toContain('mx-auto');
  });
});

describe('Divider', () => {
  it('renders role="separator"', () => {
    renderWithProviders(<Divider />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('horizontal (default) → h-px w-full + aria-orientation="horizontal"', () => {
    renderWithProviders(<Divider />);
    const sep = screen.getByRole('separator');
    expect(sep).toHaveAttribute('aria-orientation', 'horizontal');
    expect(sep.className).toContain('h-px');
    expect(sep.className).toContain('w-full');
  });

  it('vertical → w-px h-full + aria-orientation="vertical"', () => {
    renderWithProviders(<Divider orientation="vertical" />);
    const sep = screen.getByRole('separator');
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    expect(sep.className).toContain('w-px');
    expect(sep.className).toContain('h-full');
  });

  it('uses border default bg color', () => {
    renderWithProviders(<Divider />);
    const sep = screen.getByRole('separator');
    expect(sep.className).toContain('bg-[var(--ms-border-default)]');
  });
});

describe('Stack', () => {
  it('renders as <div> with flex', () => {
    const { container } = renderWithProviders(<Stack>X</Stack>);
    const div = container.querySelector('div');
    expect(div?.className).toContain('flex');
  });

  it('default direction is column (flex-col)', () => {
    const { container } = renderWithProviders(<Stack>X</Stack>);
    expect(container.querySelector('div')?.className).toContain('flex-col');
  });

  it('direction=row → flex-row', () => {
    const { container } = renderWithProviders(<Stack direction="row">X</Stack>);
    expect(container.querySelector('div')?.className).toContain('flex-row');
  });

  it('default gap is 3', () => {
    const { container } = renderWithProviders(<Stack>X</Stack>);
    expect(container.querySelector('div')?.className).toContain('gap-3');
  });

  it.each([1, 2, 3, 4, 5, 6, 8] as const)('gap=%i applies gap-%i', (g) => {
    const { container } = renderWithProviders(<Stack gap={g}>X</Stack>);
    expect(container.querySelector('div')?.className).toContain(`gap-${g}`);
  });

  it.each([
    ['start', 'items-start'],
    ['center', 'items-center'],
    ['end', 'items-end'],
    ['stretch', 'items-stretch'],
    ['baseline', 'items-baseline'],
  ] as const)('align=%s applies %s', (a, expected) => {
    const { container } = renderWithProviders(<Stack align={a}>X</Stack>);
    expect(container.querySelector('div')?.className).toContain(expected);
  });

  it.each([
    ['start', 'justify-start'],
    ['center', 'justify-center'],
    ['end', 'justify-end'],
    ['between', 'justify-between'],
    ['around', 'justify-around'],
  ] as const)('justify=%s applies %s', (j, expected) => {
    const { container } = renderWithProviders(<Stack justify={j}>X</Stack>);
    expect(container.querySelector('div')?.className).toContain(expected);
  });

  it('wrap=true applies flex-wrap', () => {
    const { container } = renderWithProviders(<Stack wrap>X</Stack>);
    expect(container.querySelector('div')?.className).toContain('flex-wrap');
  });
});

describe('Card', () => {
  it('Card renders as <div> with rounded + border + bg-surface', () => {
    const { container } = renderWithProviders(<Card>X</Card>);
    const div = container.querySelector('div');
    expect(div?.className).toContain('rounded-[var(--ms-radius-md)]');
    expect(div?.className).toContain('border-[var(--ms-border-default)]');
    expect(div?.className).toContain('bg-[var(--ms-bg-surface)]');
  });

  it('CardHeader renders with px-4 py-3 + border-b', () => {
    const { container } = renderWithProviders(<CardHeader>X</CardHeader>);
    const div = container.querySelector('div');
    expect(div?.className).toContain('px-4');
    expect(div?.className).toContain('py-3');
    expect(div?.className).toContain('border-b');
  });

  it('CardTitle renders as <h2>', () => {
    const { container } = renderWithProviders(<CardTitle>My Title</CardTitle>);
    const h2 = container.querySelector('h2');
    expect(h2).toBeInTheDocument();
    expect(h2?.textContent).toBe('My Title');
    expect(h2?.className).toContain('font-semibold');
  });

  it('CardContent renders with px-4 py-3 padding', () => {
    const { container } = renderWithProviders(<CardContent>X</CardContent>);
    const div = container.querySelector('div');
    expect(div?.className).toContain('px-4');
    expect(div?.className).toContain('py-3');
  });

  it('CardFooter renders flex + items-center + gap-2 + border-t', () => {
    const { container } = renderWithProviders(<CardFooter>X</CardFooter>);
    const div = container.querySelector('div');
    expect(div?.className).toContain('flex');
    expect(div?.className).toContain('items-center');
    expect(div?.className).toContain('gap-2');
    expect(div?.className).toContain('border-t');
  });

  it('full Card composition renders all parts', () => {
    renderWithProviders(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Body</p>
        </CardContent>
        <CardFooter>
          <button>Action</button>
        </CardFooter>
      </Card>,
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('renders the title as <h1>', () => {
    const { container } = renderWithProviders(<PageHeader title="Page Title" />);
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe('Page Title');
    expect(h1?.className).toContain('font-semibold');
  });

  it('does NOT render subtitle by default', () => {
    renderWithProviders(<PageHeader title="x" />);
    expect(screen.queryByText('My subtitle')).toBeNull();
  });

  it('renders subtitle as <p> when provided', () => {
    renderWithProviders(<PageHeader title="x" subtitle="My subtitle" />);
    expect(screen.getByText('My subtitle')).toBeInTheDocument();
  });

  it('does NOT render back link by default', () => {
    renderWithProviders(<PageHeader title="x" />);
    expect(screen.queryByText('← Назад')).toBeNull();
  });

  it('renders back link as <a href> when backHref provided', () => {
    renderWithProviders(<PageHeader title="x" backHref="/list" />);
    const back = screen.getByText('← Назад');
    expect(back.tagName).toBe('A');
    expect(back).toHaveAttribute('href', '/list');
  });

  it('renders breadcrumbs slot above the title row', () => {
    renderWithProviders(
      <PageHeader title="x" breadcrumbs={<nav data-test-id="my-breadcrumbs">crumbs</nav>} />,
    );
    expect(screen.getByTestId('my-breadcrumbs')).toBeInTheDocument();
  });

  it('renders actions slot to the right', () => {
    renderWithProviders(
      <PageHeader title="x" actions={<button data-test-id="my-action">Save</button>} />,
    );
    expect(screen.getByTestId('my-action')).toBeInTheDocument();
  });

  it('renders as <header> tag', () => {
    const { container } = renderWithProviders(<PageHeader title="x" />);
    expect(container.querySelector('header')).toBeInTheDocument();
  });
});

describe('Breadcrumb', () => {
  it('renders as <nav> with aria-label "Breadcrumb"', () => {
    renderWithProviders(<Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Items' }]} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('renders an <ol> with one <li> per item', () => {
    const { container } = renderWithProviders(
      <Breadcrumb
        items={[{ label: 'A', href: '/a' }, { label: 'B', href: '/b' }, { label: 'C' }]}
      />,
    );
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('items with href (non-last) render as <a>', () => {
    renderWithProviders(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Items', href: '/items' },
          { label: 'Detail' },
        ]}
      />,
    );
    const home = screen.getByText('Home') as HTMLAnchorElement;
    expect(home.tagName).toBe('A');
    expect(home).toHaveAttribute('href', '/');
  });

  it('the last item renders as <span>, even with href', () => {
    renderWithProviders(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Last', href: '/last' },
        ]}
      />,
    );
    const last = screen.getByText('Last');
    // Even though href is set, last item is rendered as <span>
    expect(last.tagName).toBe('SPAN');
  });

  it('items without href render as <span>', () => {
    renderWithProviders(<Breadcrumb items={[{ label: 'PlainLabel' }]} />);
    const lbl = screen.getByText('PlainLabel');
    expect(lbl.tagName).toBe('SPAN');
  });

  it('renders chevron (svg) between items but not after last', () => {
    const { container } = renderWithProviders(
      <Breadcrumb
        items={[{ label: 'A', href: '/a' }, { label: 'B', href: '/b' }, { label: 'C' }]}
      />,
    );
    // 3 items → 2 chevrons (between A→B and B→C)
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(2);
  });

  it('handles single-item breadcrumb (no chevrons)', () => {
    const { container } = renderWithProviders(<Breadcrumb items={[{ label: 'OnlyOne' }]} />);
    expect(container.querySelectorAll('svg')).toHaveLength(0);
    expect(screen.getByText('OnlyOne')).toBeInTheDocument();
  });
});
