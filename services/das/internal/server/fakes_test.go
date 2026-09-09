package server

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"udangujang/das/internal/domain"
)

// fakeKastamerRepo is an in-memory domain.KastamerRepository used to unit
// test handlers without a Firestore connection.
type fakeKastamerRepo struct {
	mu     sync.Mutex
	byID   map[string]domain.Kastamer
	nextID int
}

func newFakeKastamerRepo() *fakeKastamerRepo {
	return &fakeKastamerRepo{byID: map[string]domain.Kastamer{}}
}

func (f *fakeKastamerRepo) Create(_ context.Context, k domain.Kastamer) (domain.Kastamer, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, existing := range f.byID {
		if existing.NoHp == k.NoHp {
			return domain.Kastamer{}, domain.ErrDuplicateNoHp
		}
	}
	f.nextID++
	k.ID = fmt.Sprintf("kastamer-%d", f.nextID)
	f.byID[k.ID] = k
	return k, nil
}

func (f *fakeKastamerRepo) GetByNoHp(_ context.Context, noHp string) (domain.Kastamer, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, k := range f.byID {
		if k.NoHp == noHp {
			return k, nil
		}
	}
	return domain.Kastamer{}, domain.ErrNotFound
}

func (f *fakeKastamerRepo) List(_ context.Context) ([]domain.Kastamer, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]domain.Kastamer, 0, len(f.byID))
	for _, k := range f.byID {
		out = append(out, k)
	}
	return out, nil
}

func (f *fakeKastamerRepo) Update(_ context.Context, k domain.Kastamer) (domain.Kastamer, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	existing, ok := f.byID[k.ID]
	if !ok {
		return domain.Kastamer{}, domain.ErrNotFound
	}
	existing.Nama = k.Nama
	existing.Catatan = k.Catatan
	f.byID[k.ID] = existing
	return existing, nil
}

// fakeAlamatRepo is an in-memory domain.AlamatRepository used to unit test
// handlers without a Firestore connection.
type fakeAlamatRepo struct {
	mu     sync.Mutex
	byID   map[string]domain.Alamat
	nextID int
}

func newFakeAlamatRepo() *fakeAlamatRepo {
	return &fakeAlamatRepo{byID: map[string]domain.Alamat{}}
}

func (f *fakeAlamatRepo) Create(_ context.Context, a domain.Alamat) (domain.Alamat, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nextID++
	a.ID = fmt.Sprintf("alamat-%d", f.nextID)
	f.byID[a.ID] = a
	return a, nil
}

func (f *fakeAlamatRepo) ListByKastamer(_ context.Context, kastamerID string) ([]domain.Alamat, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []domain.Alamat
	for _, a := range f.byID {
		if a.KastamerID == kastamerID {
			out = append(out, a)
		}
	}
	return out, nil
}

func (f *fakeAlamatRepo) Update(_ context.Context, a domain.Alamat) (domain.Alamat, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	existing, ok := f.byID[a.ID]
	if !ok {
		return domain.Alamat{}, domain.ErrNotFound
	}
	existing.WilayahID = a.WilayahID
	existing.Label = a.Label
	existing.Alamat = a.Alamat
	existing.Lat = a.Lat
	existing.Lng = a.Lng
	existing.MapsLink = a.MapsLink
	existing.IsDefault = a.IsDefault
	f.byID[a.ID] = existing
	return existing, nil
}

// fakeWilayahRepo is an in-memory domain.WilayahRepository used to unit
// test handlers without a Firestore connection.
type fakeWilayahRepo struct {
	mu     sync.Mutex
	byID   map[string]domain.Wilayah
	nextID int
}

func newFakeWilayahRepo() *fakeWilayahRepo {
	return &fakeWilayahRepo{byID: map[string]domain.Wilayah{}}
}

func (f *fakeWilayahRepo) Create(_ context.Context, w domain.Wilayah) (domain.Wilayah, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nextID++
	w.ID = fmt.Sprintf("wilayah-%d", f.nextID)
	f.byID[w.ID] = w
	return w, nil
}

func (f *fakeWilayahRepo) List(_ context.Context) ([]domain.Wilayah, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]domain.Wilayah, 0, len(f.byID))
	for _, w := range f.byID {
		out = append(out, w)
	}
	return out, nil
}

// fakePesananRepo is an in-memory domain.PesananRepository used to unit
// test handlers without a Firestore connection. kastamerByID/alamatByID
// let tests seed the joined data GetDetail returns — the fake has no
// access to fakeKastamerRepo/fakeAlamatRepo, unlike the Firestore impl
// which reads their collections directly (see store/firestore/pesanan.go).
type fakePesananRepo struct {
	mu           sync.Mutex
	byID         map[string]domain.Pesanan
	statusLogs   map[string][]domain.StatusLog
	kastamerByID map[string]domain.Kastamer
	alamatByID   map[string]domain.Alamat
	nextID       int
}

func newFakePesananRepo() *fakePesananRepo {
	return &fakePesananRepo{
		byID:         map[string]domain.Pesanan{},
		statusLogs:   map[string][]domain.StatusLog{},
		kastamerByID: map[string]domain.Kastamer{},
		alamatByID:   map[string]domain.Alamat{},
	}
}

func (f *fakePesananRepo) Create(_ context.Context, p domain.Pesanan) (domain.Pesanan, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.nextID++
	p.ID = fmt.Sprintf("pesanan-%d", f.nextID)
	f.byID[p.ID] = p
	return p, nil
}

func (f *fakePesananRepo) GetByID(_ context.Context, id string) (domain.Pesanan, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.byID[id]
	if !ok {
		return domain.Pesanan{}, domain.ErrNotFound
	}
	return p, nil
}

func (f *fakePesananRepo) List(_ context.Context, filter domain.PesananFilter) ([]domain.Pesanan, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []domain.Pesanan
	for _, p := range f.byID {
		if filter.StatusPengiriman != "" && p.StatusPengiriman != filter.StatusPengiriman {
			continue
		}
		if filter.StatusPembayaran != "" && p.StatusPembayaran != filter.StatusPembayaran {
			continue
		}
		if !filter.TanggalDari.IsZero() && p.TanggalAntar.Before(filter.TanggalDari) {
			continue
		}
		if !filter.TanggalSampai.IsZero() && p.TanggalAntar.After(filter.TanggalSampai) {
			continue
		}
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TanggalAntar.Before(out[j].TanggalAntar) })
	if filter.Limit > 0 && len(out) > filter.Limit {
		out = out[:filter.Limit]
	}
	return out, nil
}

func (f *fakePesananRepo) GetDetail(_ context.Context, id string) (domain.PesananDetail, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.byID[id]
	if !ok {
		return domain.PesananDetail{}, domain.ErrNotFound
	}
	logs := append([]domain.StatusLog(nil), f.statusLogs[id]...)
	return domain.PesananDetail{
		Pesanan:   p,
		Kastamer:  f.kastamerByID[p.KastamerID],
		Alamat:    f.alamatByID[p.AlamatID],
		StatusLog: logs,
	}, nil
}

// UpdateStatus mirrors the Firestore implementation's behavior (see
// store/firestore/pesanan.go's UpdateStatus) so handler tests exercise the
// same log-writing/tanggal-setting rules a real backend would apply.
func (f *fakePesananRepo) UpdateStatus(_ context.Context, id string, statusPengiriman, statusPembayaran *string) (domain.Pesanan, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.byID[id]
	if !ok {
		return domain.Pesanan{}, domain.ErrNotFound
	}

	now := time.Now().UTC()
	if statusPengiriman != nil && *statusPengiriman != p.StatusPengiriman {
		f.statusLogs[id] = append(f.statusLogs[id], domain.StatusLog{
			PesananID:   id,
			StatusLama:  p.StatusPengiriman,
			StatusBaru:  *statusPengiriman,
			JenisStatus: domain.JenisStatusPengiriman,
			ChangedAt:   now,
		})
		p.StatusPengiriman = *statusPengiriman
		if p.StatusPengiriman == domain.StatusPengirimanSudahAntar && p.TanggalKonfirmasiAntar.IsZero() {
			p.TanggalKonfirmasiAntar = now
		}
	}
	if statusPembayaran != nil && *statusPembayaran != p.StatusPembayaran {
		f.statusLogs[id] = append(f.statusLogs[id], domain.StatusLog{
			PesananID:   id,
			StatusLama:  p.StatusPembayaran,
			StatusBaru:  *statusPembayaran,
			JenisStatus: domain.JenisStatusPembayaran,
			ChangedAt:   now,
		})
		p.StatusPembayaran = *statusPembayaran
		if p.StatusPembayaran == domain.StatusPembayaranSudahBayar && p.TanggalBayar.IsZero() {
			p.TanggalBayar = now
		}
	}
	p.UpdatedAt = now
	f.byID[id] = p
	return p, nil
}

// fakePromoRepo is an in-memory domain.PromoRepository used to unit test
// handlers without a Firestore connection.
type fakePromoRepo struct {
	mu     sync.Mutex
	byCode map[string]domain.Promo
}

func newFakePromoRepo() *fakePromoRepo {
	return &fakePromoRepo{byCode: map[string]domain.Promo{}}
}

// put stores p under its uppercased Code, mirroring the Firestore
// implementation's doc-ID convention (see store/firestore/promo.go).
func (f *fakePromoRepo) put(p domain.Promo) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.byCode[strings.ToUpper(p.Code)] = p
}

func (f *fakePromoRepo) GetPromo(_ context.Context, code string) (domain.Promo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p, ok := f.byCode[strings.ToUpper(code)]
	if !ok {
		return domain.Promo{}, domain.ErrNotFound
	}
	return p, nil
}

func (f *fakePromoRepo) ListPromos(_ context.Context) ([]domain.Promo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]domain.Promo, 0, len(f.byCode))
	for _, p := range f.byCode {
		out = append(out, p)
	}
	return out, nil
}

func (f *fakePromoRepo) CreatePromo(_ context.Context, p domain.Promo) (domain.Promo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	docID := strings.ToUpper(p.Code)
	if _, ok := f.byCode[docID]; ok {
		return domain.Promo{}, domain.ErrDuplicateCode
	}
	p.Code = docID
	p.UsedCount = 0
	f.byCode[docID] = p
	return p, nil
}

func (f *fakePromoRepo) UpdatePromo(_ context.Context, p domain.Promo) (domain.Promo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	docID := strings.ToUpper(p.Code)
	existing, ok := f.byCode[docID]
	if !ok {
		return domain.Promo{}, domain.ErrNotFound
	}
	p.Code = docID
	p.UsedCount = existing.UsedCount
	f.byCode[docID] = p
	return p, nil
}

func (f *fakePromoRepo) DeletePromo(_ context.Context, code string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.byCode, strings.ToUpper(code))
	return nil
}

func (f *fakePromoRepo) SetPromoActive(_ context.Context, code string, active bool) (domain.Promo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	docID := strings.ToUpper(code)
	p, ok := f.byCode[docID]
	if !ok {
		return domain.Promo{}, domain.ErrNotFound
	}
	p.Active = active
	f.byCode[docID] = p
	return p, nil
}

// fakeTransaksiRepo is an in-memory domain.TransaksiRepository used to
// unit test TransaksiServer without a Firestore connection.
type fakeTransaksiRepo struct {
	mu     sync.Mutex
	byID   map[string]domain.Transaksi
	nextID int
}

func newFakeTransaksiRepo() *fakeTransaksiRepo {
	return &fakeTransaksiRepo{byID: map[string]domain.Transaksi{}}
}

func (f *fakeTransaksiRepo) Create(_ context.Context, t domain.Transaksi) (domain.Transaksi, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	count := 0
	for _, existing := range f.byID {
		if existing.Tanggal == t.Tanggal {
			count++
		}
	}
	f.nextID++
	t.ID = fmt.Sprintf("trx-%d", f.nextID)
	t.Urutan = count
	now := time.Now()
	t.CreatedAt = now
	t.UpdatedAt = now
	f.byID[t.ID] = t
	return t, nil
}

func (f *fakeTransaksiRepo) GetByID(_ context.Context, id string) (domain.Transaksi, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	t, ok := f.byID[id]
	if !ok {
		return domain.Transaksi{}, domain.ErrNotFound
	}
	return t, nil
}

func (f *fakeTransaksiRepo) List(_ context.Context, filter domain.TransaksiFilter) ([]domain.Transaksi, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []domain.Transaksi
	for _, t := range f.byID {
		if filter.TanggalDari != "" && t.Tanggal < filter.TanggalDari {
			continue
		}
		if filter.TanggalSampai != "" && t.Tanggal > filter.TanggalSampai {
			continue
		}
		if filter.Kategori != "" && t.Kategori != filter.Kategori {
			continue
		}
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Tanggal != out[j].Tanggal {
			return out[i].Tanggal < out[j].Tanggal
		}
		return out[i].Urutan < out[j].Urutan
	})
	if filter.Limit > 0 && len(out) > filter.Limit {
		out = out[:filter.Limit]
	}
	return out, nil
}

func (f *fakeTransaksiRepo) Update(_ context.Context, t domain.Transaksi) (domain.Transaksi, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	existing, ok := f.byID[t.ID]
	if !ok {
		return domain.Transaksi{}, domain.ErrNotFound
	}
	t.Urutan = existing.Urutan
	t.CreatedAt = existing.CreatedAt
	t.UpdatedAt = time.Now()
	f.byID[t.ID] = t
	return t, nil
}

func (f *fakeTransaksiRepo) Delete(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.byID, id)
	return nil
}

func (f *fakeTransaksiRepo) Reorder(_ context.Context, tanggal string, ids []string) ([]domain.Transaksi, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	group := map[string]domain.Transaksi{}
	for _, t := range f.byID {
		if t.Tanggal == tanggal {
			group[t.ID] = t
		}
	}
	if len(ids) != len(group) {
		return nil, domain.ErrReorderMismatch
	}
	for _, id := range ids {
		if _, ok := group[id]; !ok {
			return nil, domain.ErrReorderMismatch
		}
	}

	now := time.Now()
	out := make([]domain.Transaksi, 0, len(ids))
	for i, id := range ids {
		t := group[id]
		t.Urutan = i
		t.UpdatedAt = now
		f.byID[id] = t
		out = append(out, t)
	}
	return out, nil
}

// fakeRuteRepo is an in-memory domain.RuteRepository used to unit test
// RuteServer without a Firestore connection.
type fakeRuteRepo struct {
	mu    sync.Mutex
	byTgl map[string]domain.RuteHarian
	depot *domain.Depot
}

func newFakeRuteRepo() *fakeRuteRepo {
	return &fakeRuteRepo{byTgl: map[string]domain.RuteHarian{}}
}

func (f *fakeRuteRepo) Get(_ context.Context, tanggal string) (domain.RuteHarian, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	r, ok := f.byTgl[tanggal]
	if !ok {
		return domain.RuteHarian{}, domain.ErrNotFound
	}
	return r, nil
}

func (f *fakeRuteRepo) Save(_ context.Context, tanggal string, pesananIDs []string) (domain.RuteHarian, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	now := time.Now()
	existing, ok := f.byTgl[tanggal]
	createdAt := now
	if ok {
		createdAt = existing.CreatedAt
	}
	r := domain.RuteHarian{
		Tanggal:    tanggal,
		PesananIDs: pesananIDs,
		CreatedAt:  createdAt,
		UpdatedAt:  now,
	}
	f.byTgl[tanggal] = r
	return r, nil
}

func (f *fakeRuteRepo) Delete(_ context.Context, tanggal string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.byTgl, tanggal)
	return nil
}

func (f *fakeRuteRepo) GetDepot(_ context.Context) (domain.Depot, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.depot == nil {
		return domain.Depot{}, domain.ErrNotFound
	}
	return *f.depot, nil
}

func (f *fakeRuteRepo) UpdateDepot(_ context.Context, depot domain.Depot) (domain.Depot, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.depot = &depot
	return depot, nil
}
