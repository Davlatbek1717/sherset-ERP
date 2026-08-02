'use client';

/**
 * Dispecher paneli — yetkazma biriktirish va holatini yuritish.
 *
 * NEGA: `POST /driver-trips` 2026-07-28 (`f0dd781`) da qurilgan, lekin uni
 * CHAQIRADIGAN ekran hech qachon bo'lmagan — web faqat `/driver-tracking/live`
 * ni o'qirdi. Natijada `DriverTrip` yozuvi yaratilmasdi va unga bog'liq HAMMA
 * narsa o'lik edi: ETA-worker hisoblaydigan yetkazma yo'q · ping ingest'dagi
 * «manzilga yetdi» avto-belgilash (`ARRIVE_RADIUS_M`) hech qachon ishga
 * tushmasdi · smena yakunidagi `deliveriesCount` doim 0 qolardi (u
 * `status='completed'` yetkazmalarni sanaydi). 2026-08-02 prod tekshiruvi:
 * `driver_trips` = 0.
 *
 * Manzil GIBRID (TZ §6): Yandex kaliti bo'lsa matndan koordinata topiladi,
 * bo'lmasa (`enabled:false`) dispecher koordinatani QO'LDA kiritadi — kalitsiz
 * ham panel ishlaydi, chunki prodda kalit hali yo'q.
 */

import { api } from '@/lib/api-client';
import { NEXT_STATUS, coordsValid } from '@/lib/driver-trip-fsm';
import { type AssignTripInput, type DriverTrip, driverTripApi } from '@/lib/hr-api';
import {
  Alert,
  Button,
  Combobox,
  type ComboboxItem,
  Input,
  NativeSelect,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * TZ §7.1 — yetkazma ↔ hujjat bog'lanishi. `DriverTrip.orderType`/`orderId`
 * ustunlari 2026-07-28 dan BERI BOR edi, lekin ularni to'ldiradigan ekran
 * yo'qligi uchun har yetkazma `manual` bo'lib qolardi va «haydovchi qaysi
 * hujjatni yetkazyapti» degan savolga javob yo'q edi.
 *
 * Manzil hujjatdan olinadi (`shipmentAddress` — «Адрес доставки»), shuning
 * uchun dispecher uni qayta yozmaydi: bir manzil ikki joyda turib farq
 * qilmasin.
 */
interface OrderHit {
  id: string;
  name: string;
  agentName: string | null;
  shipmentAddress: string | null;
}

async function searchDemands(q: string): Promise<OrderHit[]> {
  const r = await api.get<{
    items: {
      id: string;
      name: string;
      agent?: { name: string } | null;
      shipmentAddress?: string | null;
    }[];
  }>(`/demands?state=posted&search=${encodeURIComponent(q)}&limit=20`);
  return r.items.map((d) => ({
    id: d.id,
    name: d.name,
    agentName: d.agent?.name ?? null,
    shipmentAddress: d.shipmentAddress ?? null,
  }));
}

export interface DriverOption {
  driverId: string;
  name: string;
}

export function DriverTripAssign({ drivers }: { drivers: DriverOption[] }) {
  const t = useTranslations('pages.driver_trips');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [driverId, setDriverId] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  // Manba hujjat: 'manual' = erkin manzil; 'demand' = Otgruzka'ga bog'langan.
  const [orderType, setOrderType] = useState<'manual' | 'demand'>('manual');
  const [orderId, setOrderId] = useState<string>('');
  const [orderHits, setOrderHits] = useState<OrderHit[]>([]);
  // 'auto' faqat geokoder koordinatani TOPGAN bo'lsa — aks holda 'manual'
  // (server `geocodeSource` ni saqlaydi, keyin sifatni ajratish uchun kerak).
  const [source, setSource] = useState<'auto' | 'manual'>('manual');
  // Qaysi geokoder topgani — OpenStreetMap natijasi uchun atribut ODbL
  // bo'yicha MAJBURIY (xarita plitkalarida atribut bor, lekin geokod natijasi
  // alohida ma'lumot — u ham belgilanadi).
  const [geoProvider, setGeoProvider] = useState<'nominatim' | 'yandex' | null>(null);

  const { data: trips } = useQuery<DriverTrip[]>({
    queryKey: ['driver-trips-active'],
    queryFn: () => driverTripApi.listActive(),
    refetchInterval: 30_000,
  });

  const geocodeMut = useMutation({
    mutationFn: () => driverTripApi.geocode(address.trim()),
    onSuccess: (r) => {
      if (!r.enabled) {
        toast.error(t('geocode_disabled'));
        return;
      }
      if (!r.result) {
        toast.error(t('geocode_not_found'));
        return;
      }
      setLat(String(r.result.lat));
      setLng(String(r.result.lng));
      setSource('auto');
      setGeoProvider(r.provider);
      if (r.result.formatted) setAddress(r.result.formatted);
      toast.success(t('geocode_ok'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMut = useMutation({
    mutationFn: () => {
      const payload: AssignTripInput = {
        driverId,
        // Hujjat tanlanmagan bo'lsa `manual` — server enum'i shuni kutadi
        // (bog'lanmagan yetkazma ham qonuniy: telefon orqali kelgan buyurtma).
        orderType: orderType === 'demand' && orderId ? 'demand' : 'manual',
        orderId: orderType === 'demand' && orderId ? orderId : null,
        destLat: Number(lat),
        destLng: Number(lng),
        destAddress: address.trim() || null,
        geocodeSource: source,
      };
      return driverTripApi.assign(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-trips-active'] });
      qc.invalidateQueries({ queryKey: ['driver-live'] });
      setAddress('');
      setLat('');
      setLng('');
      setSource('manual');
      setGeoProvider(null);
      setOrderId('');
      setOrderHits([]);
      toast.success(t('assigned'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DriverTrip['status'] }) =>
      driverTripApi.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-trips-active'] });
      qc.invalidateQueries({ queryKey: ['driver-live'] });
    },
    // Server CAS bilan 409 qaytarishi mumkin (ping avto-«yetdi» qilib qo'ysa) —
    // xabarni KO'RSATAMIZ, jim yutmaymiz.
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = coordsValid(lat, lng);
  const canAssign = !!driverId && valid && !assignMut.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] p-3"
        data-test-id="driver-trip-assign"
      >
        <h2 className="mb-2 font-semibold text-sm">{t('assign_title')}</h2>

        {drivers.length === 0 ? (
          <Alert tone="warning">{t('no_drivers')}</Alert>
        ) : (
          <div className="flex flex-col gap-2">
            <NativeSelect
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              data-test-id="driver-trip-driver"
            >
              <option value="">{t('pick_driver')}</option>
              {drivers.map((d) => (
                <option key={d.driverId} value={d.driverId}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>

            {/* Manba: erkin manzil yoki hujjat (TZ §7.1) */}
            <NativeSelect
              value={orderType}
              onChange={(e) => {
                setOrderType(e.target.value as 'manual' | 'demand');
                setOrderId('');
                setOrderHits([]);
              }}
              data-test-id="driver-trip-ordertype"
            >
              <option value="manual">{t('src_manual')}</option>
              <option value="demand">{t('src_demand')}</option>
            </NativeSelect>

            {orderType === 'demand' && (
              <Combobox
                value={orderId || undefined}
                onChange={(v) => {
                  setOrderId(v ?? '');
                  const hit = orderHits.find((h) => h.id === v);
                  // Manzil hujjatdan — dispecher qayta yozmaydi (bitta manba).
                  if (hit?.shipmentAddress) {
                    setAddress(hit.shipmentAddress);
                    setSource('manual');
                    setGeoProvider(null);
                  }
                }}
                items={orderHits.map((h) => ({
                  value: h.id,
                  label: h.name,
                  sublabel: h.agentName ?? undefined,
                }))}
                onSearch={async (q): Promise<ComboboxItem[]> => {
                  const hits = await searchDemands(q);
                  setOrderHits(hits);
                  return hits.map((h) => ({
                    value: h.id,
                    label: h.name,
                    sublabel: h.agentName ?? undefined,
                  }));
                }}
                placeholder={t('pick_demand')}
                testId="driver-trip-order"
              />
            )}

            <div className="flex gap-2">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t('address_placeholder')}
                data-test-id="driver-trip-address"
              />
              <Button
                variant="secondary"
                onClick={() => geocodeMut.mutate()}
                disabled={!address.trim() || geocodeMut.isPending}
                data-test-id="driver-trip-geocode"
              >
                {t('find')}
              </Button>
            </div>

            {/* Koordinata doim ko'rinadi va tahrirlanadi — kalitsiz prodda
                yagona yo'l, kalit bilan ham geokoder xatosini tuzatish kerak. */}
            <div className="flex gap-2">
              <Input
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value);
                  setSource('manual');
                }}
                placeholder={t('lat')}
                inputMode="decimal"
                data-test-id="driver-trip-lat"
              />
              <Input
                value={lng}
                onChange={(e) => {
                  setLng(e.target.value);
                  setSource('manual');
                }}
                placeholder={t('lng')}
                inputMode="decimal"
                data-test-id="driver-trip-lng"
              />
            </div>
            {!valid && (lat.trim() !== '' || lng.trim() !== '') && (
              <p className="text-[var(--ms-text-destructive)] text-xs">{t('coords_invalid')}</p>
            )}
            {/* ODbL atributi — OpenStreetMap natijasi ko'rsatilganда majburiy. */}
            {geoProvider === 'nominatim' && source === 'auto' && (
              <p className="text-[var(--ms-text-muted)] text-xs" data-test-id="geocode-attribution">
                {t('osm_attribution')}
              </p>
            )}

            <Button
              onClick={() => assignMut.mutate()}
              disabled={!canAssign}
              data-test-id="driver-trip-assign-submit"
            >
              {t('assign')}
            </Button>
          </div>
        )}
      </div>

      {/* ── Faol yetkazmalar ── */}
      <div className="rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] p-3">
        <h2 className="mb-2 font-semibold text-sm">{t('active_title')}</h2>
        {!trips || trips.length === 0 ? (
          <p className="text-[var(--ms-text-muted)] text-sm">{t('no_active')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {trips.map((tr) => (
              <div
                key={tr.id}
                className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-3 py-2"
                data-test-id="driver-trip-row"
              >
                <div className="font-medium text-sm">{tr.destAddress ?? t('no_address')}</div>
                <div className="text-[var(--ms-text-muted)] text-xs">
                  {t(`status_${tr.status}` as 'status_assigned')}
                  {tr.etaSeconds != null && ` · ETA ${Math.round(tr.etaSeconds / 60)} ${t('min')}`}
                  {/* Bog'langan hujjatga havola — «qaysi otgruzkani yetkazyapti»
                      savoliga javob (TZ §7.1). Hujjat nomi API javobida yo'q,
                      shuning uchun havola beriladi, nom to'qib chiqarilmaydi. */}
                  {tr.orderType === 'demand' && tr.orderId && (
                    <>
                      {' · '}
                      <a className="underline" href={`/demands/${tr.orderId}`}>
                        {t('linked_demand')}
                      </a>
                    </>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {NEXT_STATUS[tr.status].map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === 'cancelled' ? 'destructive' : 'secondary'}
                      onClick={() => statusMut.mutate({ id: tr.id, status: s })}
                      disabled={statusMut.isPending}
                    >
                      {t(`to_${s}` as 'to_enroute')}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
