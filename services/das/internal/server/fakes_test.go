package server

import (
	"context"
	"fmt"
	"strings"
	"sync"

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
// test handlers without a Firestore connection.
type fakePesananRepo struct {
	mu     sync.Mutex
	byID   map[string]domain.Pesanan
	nextID int
}

func newFakePesananRepo() *fakePesananRepo {
	return &fakePesananRepo{byID: map[string]domain.Pesanan{}}
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
