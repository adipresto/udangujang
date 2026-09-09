package server

import (
	"context"
	"fmt"
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
