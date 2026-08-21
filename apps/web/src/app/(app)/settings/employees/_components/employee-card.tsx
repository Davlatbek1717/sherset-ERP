'use client';

/**
 * moysklad employee card 1:1 (Настройки → Справочники → Сотрудники → карточка).
 * Ground: owner screenshots 2026-07-16 (#Employee/edit — Бекзод card).
 *
 * Layout: toolbar (Сохранить · Закрыть · ? · Поместить в архив · Удалить
 * сотрудника · [name+Отдел▾] · Изменения:-link) over a two-column body:
 *   left  — *Фамилия Имя Отчество Телефон Должность Оклад ИНН Описание
 *           + «Изображение» section
 *   right — «Вход в МойСклад» (Разрешить вход · Логин · E-mail · *Отдел ·
 *           Сбросить пароль) · «Системные роли» (warning + 4 radios) ·
 *           «Сеть» (+IP адрес / +IP-сеть) · «Уведомления» (10-row matrix)
 * Section headings use the burnt-orange --ms-settings-heading token.
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { employeeImageRawUrl } from '@/lib/image-url';
import {
  Alert,
  Button,
  Checkbox,
  FileDrop,
  Icons,
  Input,
  NativeSelect,
  PasswordInput,
  RadioGroup,
  Switch,
  Textarea,
  useConfirm,
  useToast,
} from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AccessSettingsModal } from './access-settings-modal';
import { EmployeeHistoryLink } from './employee-history-link';
import { PosPinModal } from './pos-pin-modal';
import { ResetPasswordModal } from './reset-password-modal';
import { RoleAccessInline } from './role-access-inline';
import { SmenaAssignSection } from './smena-assign-section';

// ── API shapes ──────────────────────────────────────────────────────────────

export interface EmployeeDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  username: string | null;
  version: number;
  lastLoginAt: string | null;
  updatedAt: string | null;
  archived: boolean;
  hasImage: boolean;
  imageName: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  position: string | null;
  salaryMinor: string | null;
  inn: string | null;
  description: string | null;
  groupId: string | null;
  roles: Array<{ role: { id: string; name: string; isSystem: boolean } }>;
  loginAllowed: boolean;
  allowedIps: string[];
  allowedNetworks: string[];
  notifications: Record<
    string,
    { enabled?: boolean; web?: boolean; email?: boolean; phone?: boolean }
  >;
  /** Faza D1 — bog'langan Telegram chat_id (null ⇒ ulanmagan). */
  telegramChatId?: string | null;
}

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
}

interface GroupRow {
  id: string;
  name: string;
}

type RoleChoice = 'owner' | 'admin' | 'user' | 'pos';

const OWNER_ROLE = 'AccountOwner';
const ADMIN_ROLE = 'Administrator';
const POS_ROLE = 'PointOfSale';

/** moysklad «Уведомления» rows (owner screenshot order). EVERY toggle is
 *  interactive (owner 2026-07-17: the pale Заказы/Задачи toggles in the
 *  screenshot were just the OFF state, not disabled controls); an OFF row
 *  greys out its channel checkboxes. Сценарии/Интернет-магазины have no
 *  toggle in moysklad — checkboxes only. */
const NOTIFICATION_ROWS: Array<{ key: string; noToggle?: boolean }> = [
  { key: 'customer_orders' },
  { key: 'customer_invoices' },
  { key: 'stocks' },
  { key: 'retail' },
  { key: 'tasks' },
  { key: 'data_exchange' },
  { key: 'mentions' },
  { key: 'tracked_events' },
  { key: 'scenarios', noToggle: true },
  { key: 'online_shops', noToggle: true },
];

const DEFAULT_NOTIFICATION = { enabled: true, web: true, email: false, phone: true };

interface FormState {
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  position: string;
  /** Whole-sum display value (soums); wire format is minor units. */
  salary: string;
  inn: string;
  description: string;
  email: string;
  groupId: string;
  loginAllowed: boolean;
  allowedIps: string[];
  allowedNetworks: string[];
  notifications: Record<
    string,
    { enabled?: boolean; web?: boolean; email?: boolean; phone?: boolean }
  >;
}

const EMPTY_FORM: FormState = {
  lastName: '',
  firstName: '',
  middleName: '',
  phone: '',
  position: '',
  salary: '',
  inn: '',
  description: '',
  email: '',
  groupId: '',
  loginAllowed: true,
  allowedIps: [],
  allowedNetworks: [],
  notifications: {},
};

function formFromEmployee(e: EmployeeDetail): FormState {
  return {
    lastName: e.lastName ?? e.name.split(' ')[0] ?? '',
    firstName: e.firstName ?? '',
    middleName: e.middleName ?? '',
    phone: e.phone ?? '',
    position: e.position ?? '',
    salary: e.salaryMinor != null ? String(Math.round(Number(e.salaryMinor) / 100)) : '',
    inn: e.inn ?? '',
    description: e.description ?? '',
    email: e.email.endsWith('@hr.local') ? '' : e.email,
    groupId: e.groupId ?? '',
    loginAllowed: e.loginAllowed,
    allowedIps: e.allowedIps,
    allowedNetworks: e.allowedNetworks,
    notifications: e.notifications,
  };
}

function roleChoiceFromEmployee(e: EmployeeDetail): { choice: RoleChoice; roleId: string | null } {
  const first = e.roles[0]?.role;
  if (!first) return { choice: 'user', roleId: null };
  if (first.name === OWNER_ROLE) return { choice: 'owner', roleId: first.id };
  if (first.name === ADMIN_ROLE) return { choice: 'admin', roleId: first.id };
  if (first.name === POS_ROLE) return { choice: 'pos', roleId: first.id };
  return { choice: 'user', roleId: first.id };
}

// ── field row helper (moysklad: right-aligned label · input) ────────────────

function FieldRow({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  // Mobile (owner 2026-07-19): the 120px label + fixed 300px input (~432px)
  // was CLIPPED by the settings layout — phones stack label ABOVE a
  // full-width input (same pattern as the organization card).
  return (
    <div className="flex items-start gap-3 max-md:flex-col max-md:gap-1">
      <span className="flex w-[120px] shrink-0 justify-end pt-1.5 text-right text-[13px] text-[var(--ms-text-secondary)] leading-tight max-md:w-full max-md:justify-start max-md:pt-0 max-md:text-left">
        {required && <span className="mr-0.5 text-[var(--ms-text-destructive)]">*</span>}
        {label}
      </span>
      <div className="w-[300px] min-w-0 max-md:w-full">
        {children}
        {error && (
          <div className="mt-0.5 font-medium text-[var(--ms-text-destructive)] text-xs">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-normal text-[17px] text-[var(--ms-settings-heading)] leading-none">
      {children}
    </h2>
  );
}

// ── IP list editor («Сеть»: Доступ только с адресов / из сети) ──────────────

function IpListEditor({
  values,
  onChange,
  addLabel,
  placeholder,
  testId,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  placeholder: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      {values.map((v, i) => (
        // 🔴 `key` ichida QIYMAT bo'lmasligi kerak edi. Ilgari u
        // `${testId}-${i}-${v.length}` edi: har belgi kiritilganda uzunlik
        // o'zgarardi ⇒ key o'zgarardi ⇒ React input'ni QAYTA YARATARDI va
        // FOKUS YO'QOLARDI. Brauzerda o'lchandi (2026-08-21): to'rt belgi
        // ketma-ket yozilganda DOM tuguni to'rt marta almashdi. Natijada IP
        // manzilni yozib bo'lmasdi — har belgidan keyin qayta bosish kerak edi.
        // Pozitsion ro'yxatda kalit faqat INDEKS bo'ladi; qiymat o'zgarganda
        // React o'sha tugunni yangilaydi, almashtirmaydi.
        // Shu klass: [[conditional-adornment-remounts-input]].
        // biome-ignore lint/suspicious/noArrayIndexKey: qatorning O'ZI pozitsion — indeks aynan identifikator; kalitga QIYMAT qo'shilsa input har belgida qayta yaratiladi (fokus yo'qoladi, yuqoriga qara)
        <div key={`${testId}-${i}`} className="flex items-center gap-1.5">
          <Input
            value={v}
            placeholder={placeholder}
            onChange={(ev) => {
              const next = [...values];
              next[i] = ev.target.value;
              onChange(next);
            }}
            className="w-[220px]"
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label="remove"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <Icons.close className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="flex w-fit items-center gap-1 text-[13px] text-[var(--ms-text-link)] hover:underline"
        data-testid={`${testId}-add`}
      >
        <Icons.create className="h-3 w-3" aria-hidden />
        {addLabel}
      </button>
    </div>
  );
}

// ── main card ───────────────────────────────────────────────────────────────

export function EmployeeCard({ id }: { id?: string }) {
  const isNew = !id;
  const t = useTranslations('pages.employee_card');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const employeeQuery = useQuery<EmployeeDetail>({
    queryKey: ['employee-card', id],
    queryFn: () => api.get<EmployeeDetail>(`/hr/employees/${id}`),
    enabled: !isNew,
  });
  const groupsQuery = useQuery<{ items: GroupRow[] }>({
    queryKey: ['groups'],
    queryFn: () => api.get<{ items: GroupRow[] }>('/groups'),
  });
  const rolesQuery = useQuery<{ items: RoleRow[] }>({
    queryKey: ['roles'],
    queryFn: () => api.get<{ items: RoleRow[] }>('/roles'),
  });
  // Current owner (for the «Текущий владелец — …» line): the employee list is
  // small (an account's staff), one page is enough to find the owner row.
  const ownerQuery = useQuery<{
    rows: Array<{ id: string; name: string; email: string; roles: EmployeeDetail['roles'] }>;
  }>({
    queryKey: ['employees-owner-scan'],
    queryFn: () => api.get('/hr/employees?limit=200'),
  });

  const employee = employeeQuery.data;
  const groups = groupsQuery.data?.items ?? [];
  const roles = rolesQuery.data?.items ?? [];
  const customRoles = useMemo(
    () => roles.filter((r) => ![OWNER_ROLE, POS_ROLE].includes(r.name) && r.name !== ADMIN_ROLE),
    [roles],
  );
  const ownerRow = useMemo(
    () => ownerQuery.data?.rows.find((r) => r.roles?.some((x) => x.role.name === OWNER_ROLE)),
    [ownerQuery.data],
  );

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [roleChoice, setRoleChoice] = useState<RoleChoice>('user');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  // Yangi xodimda `roleChoice` sukut bo'yicha `'user'` va radio ALLAQACHON
  // tanlangan ko'rinadi — lekin `onChange` ishlamagani uchun rol ID bo'sh
  // qolardi. Rollar yuklangach birinchisini oldindan tanlaymiz: odatiy holat
  // qo'shimcha bosishsiz ishlaydi, validatsiya esa qolgan holatlarni tutadi.
  useEffect(() => {
    if (isNew && roleChoice === 'user' && !selectedRoleId && customRoles[0]) {
      setSelectedRoleId(customRoles[0].id);
    }
  }, [isNew, roleChoice, selectedRoleId, customRoles]);
  const [initialRole, setInitialRole] = useState<{ choice: RoleChoice; roleId: string | null }>({
    choice: 'user',
    roleId: null,
  });
  // Per-field validation errors (owner 2026-07-17: every failure must light
  // the exact field in red with a plain-language message under it — the same
  // pattern the PO/new «Контрагент» validation uses; no anonymous banners).
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Create-mode credentials (owner requirement: the new employee must be able
  // to log in with the login+parol given on this form; the card sets them via
  // set-password right after the POST).
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [posPinOpen, setPosPinOpen] = useState(false);
  const [rightsOpen, setRightsOpen] = useState(false);
  // Faza D1 — «Telegram ulash» bosilganda ko'rsatiladigan deep-link.
  const [tgLink, setTgLink] = useState<string | null>(null);
  // «Изображение»: local state so photo ops never refetch the card (a refetch
  // would clobber unsaved form edits); bust forces the <img> past the cache.
  const [image, setImage] = useState<{ has: boolean; name: string | null }>({
    has: false,
    name: null,
  });
  const [imageBust, setImageBust] = useState(0);

  useEffect(() => {
    if (employee) {
      setForm(formFromEmployee(employee));
      const rc = roleChoiceFromEmployee(employee);
      setRoleChoice(rc.choice);
      setSelectedRoleId(rc.choice === 'user' ? rc.roleId : null);
      setInitialRole(rc);
      setImage({ has: employee.hasImage, name: employee.imageName });
    }
  }, [employee]);

  // ── «Изображение» upload/remove (immediate, outside the Сохранить flow) ──

  const uploadImage = async (file: File) => {
    if (!id) return;
    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) {
      toast.error(t('image_bad_type'));
      return;
    }
    if (file.size > 4_000_000) {
      toast.error(t('image_too_big'));
      return;
    }
    const dataBase64 = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(String(reader.result));
      reader.onerror = () => rej(new Error('read failed'));
      reader.readAsDataURL(file);
    });
    try {
      await api.put(`/hr/employees/${id}/image`, {
        filename: file.name,
        mime: file.type,
        dataBase64,
      });
      setImage({ has: true, name: file.name });
      setImageBust(Date.now());
      toast.success(t('image_uploaded'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tCommon('action_failed'));
    }
  };

  const removeImage = async () => {
    if (!id) return;
    try {
      await api.delete(`/hr/employees/${id}/image`);
      setImage({ has: false, name: null });
      setImageBust(Date.now());
      toast.success(t('image_removed'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tCommon('action_failed'));
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── save ──────────────────────────────────────────────────────────────────

  const saveMutation = useApiMutation<EmployeeDetail, Error, void>({
    mutationFn: async () => {
      const name =
        [form.lastName, form.firstName, form.middleName].filter(Boolean).join(' ').trim() ||
        form.lastName;
      const payload: Record<string, unknown> = {
        name,
        lastName: form.lastName || null,
        firstName: form.firstName || null,
        middleName: form.middleName || null,
        phone: form.phone || null,
        position: form.position || null,
        salaryMinor: form.salary ? String(Math.round(Number(form.salary) * 100)) : null,
        inn: form.inn || null,
        description: form.description || null,
        groupId: form.groupId || null,
        loginAllowed: form.loginAllowed,
        allowedIps: form.allowedIps.filter(Boolean),
        allowedNetworks: form.allowedNetworks.filter(Boolean),
        notifications: form.notifications,
      };
      if (form.email) payload.email = form.email;
      const saved = isNew
        ? await api.post<EmployeeDetail>('/hr/employees', payload)
        : await api.put<EmployeeDetail>(`/hr/employees/${id}`, {
            ...payload,
            version: employee?.version,
          });

      // Create-mode credentials: set the login+parol right after the insert
      // so the employee can sign in immediately (owner acceptance criterion).
      // A TOCTOU duplicate here must NOT strand the just-created employee on
      // the create form — surface the problem but continue to the card.
      if (isNew && newUsername.trim() && newPassword) {
        try {
          await api.post(`/hr/employees/${saved.id}/set-password`, {
            username: newUsername.trim(),
            password: newPassword,
          });
        } catch {
          toast.error(t('err_login_taken_after_create'));
        }
      }

      // Role radio → role assignment (owner is handled by its own button).
      if (roleChoice !== 'owner') {
        const targetRoleId = await resolveTargetRoleId();
        const changed =
          initialRole.choice !== roleChoice ||
          (roleChoice === 'user' && initialRole.roleId !== selectedRoleId) ||
          isNew;
        if (changed) {
          // Bu yerga rolsiz kelish — chaqiruvchi shartnomani buzgani
          // (validatsiya uni ushlashi kerak edi). JIMGINA o'tkazib yuborish
          // aynan shu bug-klassni tug'dirgan, shuning uchun oshkora xato.
          if (!targetRoleId) throw new Error(t('err_role_required'));
          await api.put(`/roles/employee/${saved.id}`, { roleIds: [targetRoleId] });
        }
      }
      return saved;
    },
    successMessage: t('saved'),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['employee-card'] });
      qc.invalidateQueries({ queryKey: ['employees-owner-scan'] });
      if (isNew) router.replace(`/settings/employees/${saved.id}`);
    },
    onError: (err) => {
      // Server refusals land on the exact field (duplicate email/login etc.),
      // not just in a toast the user can't act on.
      const msg = err instanceof Error ? err.message : String(err);
      if (/email/i.test(msg)) {
        setFieldErrors((e) => ({
          ...e,
          email: /allaqachon|уже|band|taken|ishlatilgan/i.test(msg) ? t('err_email_taken') : msg,
        }));
      } else if (/username|login/i.test(msg)) {
        setFieldErrors((e) => ({
          ...e,
          username: /allaqachon|уже|band|taken|ishlatilgan/i.test(msg) ? t('err_login_taken') : msg,
        }));
      } else if (/familiya-ism/i.test(msg)) {
        // «Bu familiya-ism bilan xodim allaqachon mavjud» — duplicate ФИО.
        setFieldErrors((e) => ({ ...e, lastName: t('err_name_taken') }));
      } else if (/telefon/i.test(msg)) {
        setFieldErrors((e) => ({ ...e, phone: msg }));
      }
    },
  });

  async function resolveTargetRoleId(): Promise<string | null> {
    if (roleChoice === 'admin') return roles.find((r) => r.name === ADMIN_ROLE)?.id ?? null;
    if (roleChoice === 'pos') {
      const pos = await api.post<{ id: string }>('/roles/system/pos/ensure', {});
      return pos.id;
    }
    if (roleChoice === 'user') return selectedRoleId;
    return null;
  }

  /** Full client-side validation — every rule mirrors the server schema, so a
   *  red field + plain message appears BEFORE anything is created. */
  function validateForm(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!form.lastName.trim()) errs.lastName = t('required_field');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = t('err_email_format');
    }
    if (form.phone && !/^[\d+()\-\s]{4,20}$/.test(form.phone.trim())) {
      errs.phone = t('err_phone_format');
    }
    if (form.inn && !/^\d{1,20}$/.test(form.inn.trim())) {
      errs.inn = t('err_inn_digits');
    }
    // *Отдел — required (moysklad) once the account actually has departments.
    if (form.loginAllowed && groups.length > 0 && !form.groupId) {
      errs.groupId = t('required_field');
    }
    // 🔴 ROL — JIM O'TKAZIB YUBORISH YOPILDI (egasi, 2026-08-18).
    //
    // O'lchangan hodisa: prod nginx logida bir kunda 4 ta `POST /hr/employees
    // → 201` bor, lekin `PUT /roles/employee/:id` BIRORTA HAM yo'q — ya'ni
    // xodimlar rolsiz yaratilgan va kartada «Rollar tanlanmagan» chiqqan
    // («rol tanlagan bo'lsam ham tanlanmadi deydi»). Sabab: `roleChoice`
    // sukut bo'yicha `'user'`, `selectedRoleId` esa `null` — foydalanuvchi
    // radio'ni bosmasa (u allaqachon tanlangan ko'rinadi) rol ID topilmasdi
    // va saqlash bloki `if (targetRoleId && changed)` da JIMGINA o'tib
    // ketardi. Rolsiz kassir esa smena ocholmaydi (403) — xato kassa
    // ekranida, bir necha qadam keyin ko'rinardi.
    if (roleChoice === 'user' && !selectedRoleId) {
      errs.role = t('err_role_required');
    }
    if (isNew && (newUsername.trim() || newPassword)) {
      // Owner 2026-07-19 (second report): the login is FREE-FORM — any value
      // the user wants. Only the technical minimum stays (non-empty, ≤50 =
      // the DB column size); uniqueness is checked separately.
      const u = newUsername.trim();
      if (!u) errs.username = t('required_field');
      else if (u.length > 50) errs.username = t('err_login_too_long');
      if (newPassword.length < 4) errs.password = t('password_too_short');
    }
    return errs;
  }

  async function onSave() {
    const errs = validateForm();
    // Duplicate pre-checks (best-effort, before creating anything): the list
    // search covers email + username, so «занят» lands on the field instead
    // of a post-factum server toast.
    // Each probe searches ACTIVE rows first, then the ARCHIVE: «Удалить
    // сотрудника» is a soft archive that KEEPS username/email/name occupied
    // in the DB unique indexes (owner 2026-07-19: a re-created deleted
    // employee died on an invisible archived twin with a cryptic toast) —
    // the archived flavour of the message says WHERE the value sits.
    const probe = (query: string, archived: boolean) =>
      api
        .get<{ rows: Array<{ id: string; name: string; email: string; username: string | null }> }>(
          `/hr/employees?search=${encodeURIComponent(query)}&limit=50${archived ? '&archived=true' : ''}`,
        )
        .catch(() => null);
    if (isNew && !errs.username && newUsername.trim()) {
      const u = newUsername.trim();
      const hit = (rows?: Array<{ username: string | null }>) =>
        rows?.some((r) => r.username === u);
      if (hit((await probe(u, false))?.rows)) errs.username = t('err_login_taken');
      else if (hit((await probe(u, true))?.rows)) errs.username = t('err_login_taken_archived');
    }
    if (!errs.email && form.email) {
      const mail = form.email.trim().toLowerCase();
      const hit = (rows?: Array<{ id: string; email: string }>) =>
        rows?.some((r) => r.email.toLowerCase() === mail && r.id !== id);
      if (hit((await probe(mail, false))?.rows)) errs.email = t('err_email_taken');
      else if (hit((await probe(mail, true))?.rows)) errs.email = t('err_email_taken_archived');
    }
    // Duplicate ФИО pre-check (owner 2026-07-19: prod's db-push-era DB has a
    // unique on (accountId, name) — the clash must land on the name fields
    // BEFORE the save, not as a post-factum toast).
    if (!errs.lastName && form.lastName.trim()) {
      const fullName =
        [form.lastName, form.firstName, form.middleName].filter(Boolean).join(' ').trim() ||
        form.lastName;
      const hit = (rows?: Array<{ id: string; name: string }>) =>
        rows?.some((r) => r.name === fullName && r.id !== id);
      if (hit((await probe(fullName, false))?.rows)) errs.lastName = t('err_name_taken');
      else if (hit((await probe(fullName, true))?.rows)) {
        errs.lastName = t('err_name_taken_archived');
      }
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    saveMutation.mutate();
  }

  // ── archive / delete / owner ──────────────────────────────────────────────

  const archiveMutation = useApiMutation<unknown, Error, boolean>({
    mutationFn: (archive) =>
      api.post(`/hr/employees/bulk-${archive ? 'archive' : 'restore'}`, { ids: [id] }),
    successMessage: t('saved'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-card'] }),
  });

  const deleteMutation = useApiMutation<unknown, Error, void>({
    mutationFn: () => api.post('/hr/employees/bulk-delete', { ids: [id] }),
    silent: true,
    onSuccess: (res) => {
      const failed = (res as { failed?: Array<{ error?: string }> })?.failed;
      if (failed && failed.length > 0) {
        toast.error(failed[0]?.error ?? tCommon('action_failed'));
        return;
      }
      toast.success(t('deleted'));
      router.push('/settings/employees');
    },
  });

  const ownerMutation = useApiMutation<unknown, Error, void>({
    mutationFn: () => api.post('/roles/owner/transfer', { employeeId: id }),
    successMessage: t('owner_transferred'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-card'] });
      qc.invalidateQueries({ queryKey: ['employees-owner-scan'] });
    },
  });

  // ── Telegram bog'lash (Faza D1) ───────────────────────────────────────────
  const tgBindMutation = useApiMutation<
    { deepLink: string | null; expiresAt: string },
    Error,
    void
  >({
    mutationFn: () =>
      api.post<{ deepLink: string | null; expiresAt: string }>(
        `/hr/employees/${id}/telegram-bind-token`,
        {},
      ),
    silent: true,
    onSuccess: (res) => {
      if (res.deepLink) setTgLink(res.deepLink);
      else toast.error(t('telegram_no_bot'));
    },
  });

  const tgUnbindMutation = useApiMutation<unknown, Error, void>({
    mutationFn: () => api.delete(`/hr/employees/${id}/telegram`),
    successMessage: t('telegram_unlinked'),
    onSuccess: () => {
      setTgLink(null);
      qc.invalidateQueries({ queryKey: ['employee-card'] });
    },
  });

  async function onDelete() {
    const ok = await confirm({
      title: t('delete_confirm_title'),
      description: tCommon('action_irreversible'),
      tone: 'destructive',
      confirmLabel: t('delete_employee'),
    });
    if (ok) deleteMutation.mutate();
  }

  async function onMakeOwner() {
    const ok = await confirm({
      title: t('owner_confirm_title'),
      description: t('owner_confirm_desc'),
      confirmLabel: t('make_owner'),
    });
    if (ok) ownerMutation.mutate();
  }

  if (!isNew && employeeQuery.isLoading) {
    return (
      <div className="px-8 py-6 text-[var(--ms-text-muted)] text-sm">{tCommon('loading')}</div>
    );
  }
  if (!isNew && employeeQuery.error) {
    return (
      <div className="px-8 py-6 text-[var(--ms-text-destructive)] text-sm">
        {(employeeQuery.error as Error).message}
      </div>
    );
  }

  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? customRoles[0] ?? null;
  const notif = (key: string) => ({ ...DEFAULT_NOTIFICATION, ...form.notifications[key] });
  const setNotif = (key: string, patch: Partial<typeof DEFAULT_NOTIFICATION & object>) =>
    set('notifications', { ...form.notifications, [key]: { ...notif(key), ...patch } });

  return (
    <div className="min-h-full bg-[var(--ms-bg-surface)]" data-testid="employee-card">
      {/* ── toolbar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-surface)] px-4 py-2.5">
        <Button
          variant="success"
          onClick={onSave}
          loading={saveMutation.isPending}
          data-testid="employee-save"
        >
          {t('save')}
        </Button>
        <Button variant="secondary" onClick={() => router.push('/settings/employees')}>
          {t('close')}
        </Button>
        <span className="mx-2 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--ms-border-input)] text-[11px] text-[var(--ms-text-muted)]">
          ?
        </span>
        {!isNew && (
          <>
            <Button
              variant="secondary"
              onClick={() => archiveMutation.mutate(!employee?.archived)}
              loading={archiveMutation.isPending}
              data-testid="employee-archive"
            >
              {employee?.archived ? t('unarchive') : t('archive')}
            </Button>
            <button
              type="button"
              onClick={onDelete}
              className="ml-1 text-[13px] text-[var(--ms-text-destructive)] underline decoration-dotted underline-offset-4 hover:opacity-80"
              data-testid="employee-delete"
            >
              {t('delete_employee')}
            </button>
          </>
        )}
        <div className="ml-auto flex items-center gap-4">
          {!isNew && employee && (
            <div className="flex flex-col items-end text-right leading-tight">
              <span className="font-medium text-[13px] text-[var(--ms-text-primary)]">
                {form.lastName || employee.name}
              </span>
              <span className="flex items-center gap-0.5 text-[12px] text-[var(--ms-text-muted)]">
                {groups.find((g) => g.id === form.groupId)?.name ?? t('no_department')}
                <Icons.down className="h-3 w-3" aria-hidden />
              </span>
            </div>
          )}
          {!isNew && id && <EmployeeHistoryLink employeeId={id} />}
        </div>
      </div>

      {/* ── body ────────────────────────────────────────────────────────── */}
      {/* Mobile: the two card columns stack — side-by-side they squeezed to
          ~150px each (one-word-per-line role texts, clipped matrix). */}
      <div className="flex flex-wrap gap-x-16 gap-y-8 px-6 py-5 max-md:flex-col">
        {/* left column */}
        <div className="flex flex-col gap-2.5">
          <FieldRow label={t('last_name')} required error={fieldErrors.lastName}>
            <Input
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              data-testid="employee-last-name"
              invalid={!!fieldErrors.lastName}
            />
          </FieldRow>
          <FieldRow label={t('first_name')}>
            <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </FieldRow>
          <FieldRow label={t('middle_name')}>
            <Input value={form.middleName} onChange={(e) => set('middleName', e.target.value)} />
          </FieldRow>
          <FieldRow label={t('phone')} error={fieldErrors.phone}>
            <Input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              invalid={!!fieldErrors.phone}
              data-testid="employee-phone"
            />
          </FieldRow>
          <FieldRow label={t('position')}>
            <Input value={form.position} onChange={(e) => set('position', e.target.value)} />
          </FieldRow>
          <FieldRow label={t('salary')}>
            <Input
              inputMode="numeric"
              value={form.salary}
              onChange={(e) => set('salary', e.target.value.replace(/[^\d]/g, ''))}
            />
          </FieldRow>
          <FieldRow label={t('inn')} error={fieldErrors.inn}>
            <Input
              value={form.inn}
              onChange={(e) => set('inn', e.target.value)}
              invalid={!!fieldErrors.inn}
            />
          </FieldRow>
          <FieldRow label={t('description')}>
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
            />
          </FieldRow>

          <div className="mt-6 flex flex-col gap-3">
            <SectionHeading>{t('image')}</SectionHeading>
            {isNew ? (
              // moysklad ham rasmni faqat saqlangan kartada boshqaradi.
              <span className="text-[13px] text-[var(--ms-text-muted)]">—</span>
            ) : image.has && id ? (
              <div className="flex items-center gap-2" data-testid="employee-image-block">
                <img
                  src={employeeImageRawUrl(id, imageBust)}
                  alt={image.name ?? ''}
                  className="h-12 w-12 rounded border border-[var(--ms-border-default)] object-cover"
                />
                <a
                  href={employeeImageRawUrl(id, imageBust)}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-[180px] truncate text-[13px] text-[var(--ms-text-link)] underline hover:opacity-80"
                >
                  {image.name ?? t('image')}
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={removeImage}
                  aria-label={t('image_remove')}
                  data-testid="employee-image-remove"
                >
                  <Icons.close className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            ) : (
              <FileDrop
                files={[]}
                multiple={false}
                accept="image/png,image/jpeg,image/webp,image/gif"
                maxSizeBytes={4_000_000}
                onFilesChange={(files) => {
                  const f = files[0];
                  if (f) void uploadImage(f);
                }}
                onReject={(reason) =>
                  toast.error(reason === 'size' ? t('image_too_big') : t('image_bad_type'))
                }
                hint={t('image_upload_hint')}
                className="max-w-[300px]"
                testId="employee-image-drop"
              />
            )}
          </div>
        </div>

        {/* right column */}
        <div className="flex min-w-[420px] max-w-[560px] flex-1 flex-col gap-8 max-md:min-w-0 max-md:max-w-full">
          {/* Вход в МойСклад */}
          <section className="flex flex-col gap-3">
            <SectionHeading>{t('login_section')}</SectionHeading>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-[var(--ms-text-primary)]">
              <Checkbox
                checked={form.loginAllowed}
                onCheckedChange={(v) => set('loginAllowed', v === true)}
                data-testid="employee-login-allowed"
              />
              {t('allow_login')}
            </label>
            {form.loginAllowed && (
              <div className="flex flex-col gap-2.5 pl-1">
                {isNew ? (
                  <>
                    {/* autoComplete=new-password juftligi: Chrome saqlangan
                        ADMIN loginini bu formaga o'zi tiqib qo'yardi (owner
                        skrinshoti) — «yangi hisob» sifatida belgilaymiz, shunda
                        brauzer avtoto'ldirmaydi va maydonlar bo'sh ochiladi. */}
                    <FieldRow label={t('login')} error={fieldErrors.username}>
                      <Input
                        name="new-employee-login"
                        autoComplete="off"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        data-testid="employee-new-username"
                        invalid={!!fieldErrors.username}
                      />
                    </FieldRow>
                    <FieldRow label={t('password')} error={fieldErrors.password}>
                      <PasswordInput
                        name="new-employee-password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        data-testid="employee-new-password"
                        invalid={!!fieldErrors.password}
                        showLabel={tCommon('show_password')}
                        hideLabel={tCommon('hide_password')}
                      />
                    </FieldRow>
                  </>
                ) : (
                  <FieldRow label={t('login')}>
                    <span className="block pt-1.5 text-[13px] text-[var(--ms-text-primary)]">
                      {employee?.username ?? t('no_login')}
                    </span>
                  </FieldRow>
                )}
                <FieldRow label={t('email')} error={fieldErrors.email}>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    data-testid="employee-email"
                    invalid={!!fieldErrors.email}
                  />
                </FieldRow>
                <FieldRow label={t('department')} required error={fieldErrors.groupId}>
                  <div className="flex items-center gap-1.5">
                    <NativeSelect
                      value={form.groupId}
                      onChange={(e) => set('groupId', e.target.value)}
                      className="w-[220px]"
                      data-testid="employee-department"
                      invalid={!!fieldErrors.groupId}
                    >
                      <option value="">—</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <a
                      href="/settings/departments"
                      className="text-[var(--ms-text-muted)] hover:text-[var(--ms-text-brand)]"
                      aria-label={t('edit_departments')}
                    >
                      <Icons.edit className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </div>
                </FieldRow>
                {!isNew && (
                  <div className="flex gap-2 pl-[132px]">
                    <Button
                      variant="secondary"
                      onClick={() => setPasswordOpen(true)}
                      data-testid="employee-reset-password"
                    >
                      {t('reset_password')}
                    </Button>
                    {/* Kassa PIN — kassir kiosk rejimida sozlamalarga kira
                        olmaydi, shuning uchun PIN'ni AYNAN shu yerdan admin
                        qo'yadi (2026-08-11 gacha bunday joy umuman yo'q edi). */}
                    <Button
                      variant="secondary"
                      onClick={() => setPosPinOpen(true)}
                      data-testid="employee-pos-pin"
                    >
                      {t('pos_pin_title')}
                    </Button>
                  </div>
                )}
                {/* Telegram bog'lash (Faza D1) — qabul-tasdiqlash inline-tugmalari uchun. */}
                {!isNew && (
                  <div className="flex flex-col gap-2 pl-[132px]">
                    {employeeQuery.data?.telegramChatId ? (
                      <div className="flex items-center gap-3">
                        <span className="text-[13px] text-[var(--ms-text-success)]">
                          {t('telegram_linked')} ✓
                        </span>
                        <Button
                          variant="secondary"
                          onClick={() => tgUnbindMutation.mutate()}
                          disabled={tgUnbindMutation.isPending}
                          data-testid="employee-telegram-unlink"
                        >
                          {t('telegram_unlink')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => tgBindMutation.mutate()}
                          disabled={tgBindMutation.isPending}
                          data-testid="employee-telegram-link"
                        >
                          {t('telegram_link')}
                        </Button>
                        {tgLink && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[12px] text-[var(--ms-text-muted)]">
                              {t('telegram_link_hint')}
                            </span>
                            <a
                              href={tgLink}
                              target="_blank"
                              rel="noreferrer"
                              className="break-all text-[13px] text-[var(--ms-text-brand)] hover:underline"
                              data-testid="employee-telegram-deeplink"
                            >
                              {tgLink}
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Системные роли */}
          <section className="flex flex-col gap-3">
            <SectionHeading>{t('roles_section')}</SectionHeading>
            {/* Sabab AYNAN shu yerda — bo'lim tepasida: saqlash to'xtab,
                foydalanuvchi nega ekanini ko'rmasligi eng yomon holat. */}
            {fieldErrors.role && (
              <p
                data-testid="employee-role-error"
                className="rounded-[var(--ms-radius-sm)] bg-[var(--ms-destructive-50,#fef2f2)] px-3 py-2 text-[13px] text-[var(--ms-text-destructive)]"
              >
                {fieldErrors.role}
              </p>
            )}
            <Alert tone="warning">{t('roles_warning')}</Alert>

            {/* Владелец аккаунта */}
            <div
              className={`rounded-[var(--ms-radius-default)] p-3 ${roleChoice === 'owner' ? 'bg-[var(--ms-bg-hover)]' : ''}`}
            >
              <RadioGroup<RoleChoice>
                name="employee-role"
                value={roleChoice === 'owner' ? 'owner' : undefined}
                onChange={() => undefined}
                options={[
                  {
                    value: 'owner',
                    label: t('role_owner'),
                    disabled: roleChoice !== 'owner',
                    description: (
                      <>
                        {ownerRow
                          ? t('current_owner', { owner: `${ownerRow.name} (${ownerRow.email})` })
                          : t('no_owner_yet')}
                        <br />
                        {t('role_owner_desc')}
                      </>
                    ),
                  },
                ]}
              />
              {!isNew && roleChoice !== 'owner' && (
                <div className="mt-2 pl-6">
                  <Button
                    variant="secondary"
                    onClick={onMakeOwner}
                    loading={ownerMutation.isPending}
                    data-testid="employee-make-owner"
                  >
                    {t('make_owner')}
                  </Button>
                </div>
              )}
            </div>

            {/* Администратор */}
            <div
              className={`rounded-[var(--ms-radius-default)] p-3 ${roleChoice === 'admin' ? 'bg-[var(--ms-bg-hover)]' : ''}`}
            >
              <RadioGroup<RoleChoice>
                name="employee-role"
                value={roleChoice === 'admin' ? 'admin' : undefined}
                onChange={() => setRoleChoice('admin')}
                options={[
                  { value: 'admin', label: t('role_admin'), description: t('role_admin_desc') },
                ]}
              />
            </div>

            {/* Пользователь (custom role) */}
            <div
              className={`rounded-[var(--ms-radius-default)] p-3 ${roleChoice === 'user' ? 'bg-[var(--ms-bg-hover)]' : ''}`}
            >
              <RadioGroup<RoleChoice>
                name="employee-role"
                value={roleChoice === 'user' ? 'user' : undefined}
                onChange={() => {
                  setRoleChoice('user');
                  if (!selectedRoleId && customRoles[0]) setSelectedRoleId(customRoles[0].id);
                }}
                options={[
                  {
                    value: 'user',
                    label: t('role_user', { name: selectedRole?.name ?? '…' }),
                    description: t('role_user_desc'),
                  },
                ]}
              />
              {/* MoySklad (owner screenshot 2026-07-19): NO input next to the
                  button — role selection lives INSIDE the «Настройка доступа»
                  dialog itself. */}
              {roleChoice === 'user' && (
                <div className="mt-2 pl-6">
                  <Button
                    variant="secondary"
                    onClick={() => setRightsOpen(true)}
                    data-testid="employee-configure-rights"
                  >
                    {t('configure_rights')}
                  </Button>
                </div>
              )}
            </div>

            {/* Доступ только к точкам продаж */}
            <div
              className={`rounded-[var(--ms-radius-default)] p-3 ${roleChoice === 'pos' ? 'bg-[var(--ms-bg-hover)]' : ''}`}
            >
              <RadioGroup<RoleChoice>
                name="employee-role"
                value={roleChoice === 'pos' ? 'pos' : undefined}
                onChange={() => setRoleChoice('pos')}
                options={[{ value: 'pos', label: t('role_pos'), description: t('role_pos_desc') }]}
              />
            </div>
          </section>

          {/* Kassa smenasi (P11) — kiosk kassir uchun MAJBURIY bo'g'in:
              biriktirilmagan xodim POS smenasini ocha olmaydi. Saqlangan
              kartada ko'rinadi (yangi xodimda hali id yo'q). */}
          {!isNew && id && <SmenaAssignSection employeeId={id} />}

          {/* Сеть */}
          <section className="flex flex-col gap-3">
            <SectionHeading>{t('network_section')}</SectionHeading>
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-[13px] text-[var(--ms-text-primary)]">
                {t('allowed_ips')}
              </span>
              <IpListEditor
                values={form.allowedIps}
                onChange={(v) => set('allowedIps', v)}
                addLabel={t('add_ip')}
                placeholder="192.168.0.1"
                testId="employee-allowed-ips"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-[13px] text-[var(--ms-text-primary)]">
                {t('allowed_networks')}
              </span>
              <IpListEditor
                values={form.allowedNetworks}
                onChange={(v) => set('allowedNetworks', v)}
                addLabel={t('add_network')}
                placeholder="192.168.0.0/24"
                testId="employee-allowed-networks"
              />
            </div>
          </section>

          {/* Уведомления */}
          <section className="flex flex-col gap-2">
            <SectionHeading>{t('notifications_section')}</SectionHeading>
            {/* Mobile: the 5-column matrix can't fit 390px — it keeps its shape
                and pans inside its own scroll box (was clipped, unreachable). */}
            <div className="max-md:overflow-x-auto">
              <table className="w-full max-w-[520px] border-collapse text-[13px] max-md:min-w-[480px]">
                <thead>
                  <tr className="text-[var(--ms-text-muted)]">
                    <th className="pb-2 font-normal" />
                    <th className="pb-2 font-normal" />
                    <th className="px-3 pb-2 text-center font-normal">{t('channel_web')}</th>
                    <th className="px-3 pb-2 text-center font-normal">{t('channel_email')}</th>
                    <th className="px-3 pb-2 text-center font-normal">{t('channel_phone')}</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTIFICATION_ROWS.map((row) => {
                    const v = notif(row.key);
                    // moysklad: an OFF row keeps its checkbox values visible but
                    // pale/non-editable; flipping the toggle back re-enables them.
                    const channelsDisabled = !row.noToggle && v.enabled === false;
                    return (
                      <tr
                        key={row.key}
                        className="border-[var(--ms-border-default)] border-t first:border-t-2"
                      >
                        <td className="py-2 pr-2 text-right text-[var(--ms-text-primary)]">
                          {t(`notif_${row.key}` as 'notif_stocks')}
                        </td>
                        <td className="px-2 py-2">
                          {!row.noToggle && (
                            <Switch
                              checked={v.enabled ?? true}
                              onCheckedChange={(c) => setNotif(row.key, { enabled: c === true })}
                              data-testid={`employee-notif-toggle-${row.key}`}
                            />
                          )}
                        </td>
                        {(['web', 'email', 'phone'] as const).map((ch) => (
                          <td key={ch} className="px-3 py-2 text-center">
                            <Checkbox
                              checked={v[ch] ?? false}
                              disabled={channelsDisabled}
                              onCheckedChange={(c) => setNotif(row.key, { [ch]: c === true })}
                              data-testid={`employee-notif-${row.key}-${ch}`}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Права доступа — owner 2026-07-19: the module/tab toggle tree ALSO
              lives here (the «Уведомления» area), same role data as the
              «Настройка доступа» modal but saving independently. */}
          {!isNew && roleChoice === 'user' && selectedRoleId && (
            <section className="flex flex-col gap-3">
              <SectionHeading>{t('access_inline_title')}</SectionHeading>
              <RoleAccessInline roleId={selectedRoleId} />
            </section>
          )}
        </div>
      </div>

      {/* modals */}
      {!isNew && id && (
        <ResetPasswordModal
          open={passwordOpen}
          onOpenChange={setPasswordOpen}
          employeeId={id}
          currentUsername={employee?.username ?? ''}
          onDone={() => qc.invalidateQueries({ queryKey: ['employee-card'] })}
        />
      )}
      {!isNew && id && (
        <PosPinModal open={posPinOpen} onOpenChange={setPosPinOpen} employeeId={id} />
      )}
      <AccessSettingsModal
        open={rightsOpen}
        onClose={() => setRightsOpen(false)}
        employeeId={isNew ? null : (id ?? null)}
        currentRoleId={selectedRoleId}
        roles={customRoles}
        onAssigned={(roleId) => setSelectedRoleId(roleId)}
      />
    </div>
  );
}
