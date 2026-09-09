package firestore

import (
	"context"
	"errors"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"udangujang/das/internal/domain"
)

type statusLogDoc struct {
	PesananID   string    `firestore:"pesananId"`
	StatusLama  string    `firestore:"statusLama"`
	StatusBaru  string    `firestore:"statusBaru"`
	JenisStatus string    `firestore:"jenisStatus"`
	ChangedAt   time.Time `firestore:"changedAt"`
}

type pesananItemDoc struct {
	Nama     string  `firestore:"nama"`
	Qty      float64 `firestore:"qty"`
	Satuan   string  `firestore:"satuan"`
	Harga    int64   `firestore:"harga"`
	Subtotal int64   `firestore:"subtotal"`
}

type pesananDoc struct {
	KastamerID             string           `firestore:"kastamerId"`
	AlamatID               string           `firestore:"alamatId"`
	Items                  []pesananItemDoc `firestore:"items"`
	Deskripsi              string           `firestore:"deskripsi"`
	Ongkir                 int64            `firestore:"ongkir"`
	CatatanPesanan         string           `firestore:"catatanPesanan"`
	MetodePembayaran       string           `firestore:"metodePembayaran"`
	DetailPembayaran       string           `firestore:"detailPembayaran"`
	MetodePengiriman       string           `firestore:"metodePengiriman"`
	TotalHarga             string           `firestore:"totalHarga"`
	StatusPengiriman       string           `firestore:"statusPengiriman"`
	StatusPembayaran       string           `firestore:"statusPembayaran"`
	Status                 string           `firestore:"status"`
	KodePromo              string           `firestore:"kodePromo"`
	TanggalAntar           time.Time        `firestore:"tanggalAntar"`
	TanggalKonfirmasiAntar time.Time        `firestore:"tanggalKonfirmasiAntar"`
	TanggalBayar           time.Time        `firestore:"tanggalBayar"`
	CreatedAt              time.Time        `firestore:"createdAt"`
	UpdatedAt              time.Time        `firestore:"updatedAt"`
}

// PesananRepository implements domain.PesananRepository against Firestore.
type PesananRepository struct {
	client *firestore.Client
}

func NewPesananRepository(client *firestore.Client) *PesananRepository {
	return &PesananRepository{client: client}
}

func (r *PesananRepository) Create(ctx context.Context, p domain.Pesanan) (domain.Pesanan, error) {
	now := time.Now().UTC()
	if p.CreatedAt.IsZero() {
		p.CreatedAt = now
	}
	p.UpdatedAt = now

	ref := r.client.Collection(CollectionPesanan).NewDoc()
	if _, err := ref.Set(ctx, pesananToDoc(p)); err != nil {
		return domain.Pesanan{}, fmt.Errorf("firestore: create pesanan: %w", err)
	}
	p.ID = ref.ID
	return p, nil
}

func (r *PesananRepository) GetByID(ctx context.Context, id string) (domain.Pesanan, error) {
	snap, err := r.client.Collection(CollectionPesanan).Doc(id).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return domain.Pesanan{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Pesanan{}, fmt.Errorf("firestore: get pesanan %s: %w", id, err)
	}
	var doc pesananDoc
	if err := snap.DataTo(&doc); err != nil {
		return domain.Pesanan{}, fmt.Errorf("firestore: decode pesanan %s: %w", id, err)
	}
	return pesananFromDoc(snap.Ref.ID, doc), nil
}

func (r *PesananRepository) List(ctx context.Context, filter domain.PesananFilter) ([]domain.Pesanan, error) {
	q := r.client.Collection(CollectionPesanan).Query
	if !filter.TanggalDari.IsZero() {
		q = q.Where("tanggalAntar", ">=", filter.TanggalDari)
	}
	if !filter.TanggalSampai.IsZero() {
		q = q.Where("tanggalAntar", "<=", filter.TanggalSampai)
	}
	if filter.StatusPengiriman != "" {
		q = q.Where("statusPengiriman", "==", filter.StatusPengiriman)
	}
	if filter.StatusPembayaran != "" {
		q = q.Where("statusPembayaran", "==", filter.StatusPembayaran)
	}
	q = q.OrderBy("tanggalAntar", firestore.Asc)
	if filter.Limit > 0 {
		q = q.Limit(filter.Limit)
	}

	iter := q.Documents(ctx)
	defer iter.Stop()

	var out []domain.Pesanan
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("firestore: list pesanan: %w", err)
		}
		var doc pesananDoc
		if err := snap.DataTo(&doc); err != nil {
			return nil, fmt.Errorf("firestore: decode pesanan %s: %w", snap.Ref.ID, err)
		}
		out = append(out, pesananFromDoc(snap.Ref.ID, doc))
	}
	return out, nil
}

func (r *PesananRepository) GetDetail(ctx context.Context, id string) (domain.PesananDetail, error) {
	p, err := r.GetByID(ctx, id)
	if err != nil {
		return domain.PesananDetail{}, err
	}

	detail := domain.PesananDetail{Pesanan: p}

	if p.KastamerID != "" {
		snap, err := r.client.Collection(CollectionKastamer).Doc(p.KastamerID).Get(ctx)
		if err != nil && status.Code(err) != codes.NotFound {
			return domain.PesananDetail{}, fmt.Errorf("firestore: get kastamer %s: %w", p.KastamerID, err)
		}
		if err == nil {
			var kdoc kastamerDoc
			if err := snap.DataTo(&kdoc); err != nil {
				return domain.PesananDetail{}, fmt.Errorf("firestore: decode kastamer %s: %w", p.KastamerID, err)
			}
			detail.Kastamer = kastamerFromDoc(snap.Ref.ID, kdoc)
		}
	}

	if p.AlamatID != "" {
		snap, err := r.client.Collection(CollectionAlamat).Doc(p.AlamatID).Get(ctx)
		if err != nil && status.Code(err) != codes.NotFound {
			return domain.PesananDetail{}, fmt.Errorf("firestore: get alamat %s: %w", p.AlamatID, err)
		}
		if err == nil {
			var adoc alamatDoc
			if err := snap.DataTo(&adoc); err != nil {
				return domain.PesananDetail{}, fmt.Errorf("firestore: decode alamat %s: %w", p.AlamatID, err)
			}
			detail.Alamat = alamatFromDoc(snap.Ref.ID, adoc)
		}
	}

	logs, err := r.listStatusLog(ctx, id)
	if err != nil {
		return domain.PesananDetail{}, err
	}
	detail.StatusLog = logs

	return detail, nil
}

func (r *PesananRepository) listStatusLog(ctx context.Context, pesananID string) ([]domain.StatusLog, error) {
	iter := r.client.Collection(CollectionPesanan).Doc(pesananID).Collection(CollectionStatusLog).OrderBy("changedAt", firestore.Asc).Documents(ctx)
	defer iter.Stop()

	var out []domain.StatusLog
	for {
		snap, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("firestore: list status log for pesanan %s: %w", pesananID, err)
		}
		var doc statusLogDoc
		if err := snap.DataTo(&doc); err != nil {
			return nil, fmt.Errorf("firestore: decode status log %s: %w", snap.Ref.ID, err)
		}
		out = append(out, domain.StatusLog{
			ID:          snap.Ref.ID,
			PesananID:   doc.PesananID,
			StatusLama:  doc.StatusLama,
			StatusBaru:  doc.StatusBaru,
			JenisStatus: doc.JenisStatus,
			ChangedAt:   doc.ChangedAt,
		})
	}
	return out, nil
}

// UpdateStatus changes only the status fields whose pointer is non-nil,
// writing a StatusLog entry per field that actually changes value and
// setting TanggalKonfirmasiAntar/TanggalBayar the first time that field
// flips to sudah_antar/sudah_bayar — verbatim quickStatus() behavior from
// the pre-merge dashboard (see reference/udang-dashboard/index.html).
func (r *PesananRepository) UpdateStatus(ctx context.Context, id string, statusPengiriman, statusPembayaran *string) (domain.Pesanan, error) {
	docRef := r.client.Collection(CollectionPesanan).Doc(id)

	var updated domain.Pesanan
	err := r.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(docRef)
		if status.Code(err) == codes.NotFound {
			return domain.ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("firestore: get pesanan %s: %w", id, err)
		}
		var doc pesananDoc
		if err := snap.DataTo(&doc); err != nil {
			return fmt.Errorf("firestore: decode pesanan %s: %w", id, err)
		}
		p := pesananFromDoc(snap.Ref.ID, doc)

		now := time.Now().UTC()
		var logs []domain.StatusLog

		if statusPengiriman != nil && *statusPengiriman != p.StatusPengiriman {
			logs = append(logs, domain.StatusLog{
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
			logs = append(logs, domain.StatusLog{
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

		if err := tx.Set(docRef, pesananToDoc(p)); err != nil {
			return fmt.Errorf("firestore: set pesanan %s: %w", id, err)
		}
		for _, l := range logs {
			logRef := docRef.Collection(CollectionStatusLog).NewDoc()
			if err := tx.Set(logRef, statusLogDoc{
				PesananID:   l.PesananID,
				StatusLama:  l.StatusLama,
				StatusBaru:  l.StatusBaru,
				JenisStatus: l.JenisStatus,
				ChangedAt:   l.ChangedAt,
			}); err != nil {
				return fmt.Errorf("firestore: write status log for pesanan %s: %w", id, err)
			}
		}

		updated = p
		return nil
	})
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return domain.Pesanan{}, domain.ErrNotFound
		}
		return domain.Pesanan{}, fmt.Errorf("firestore: update status pesanan %s: %w", id, err)
	}
	return updated, nil
}

func pesananToDoc(p domain.Pesanan) pesananDoc {
	items := make([]pesananItemDoc, 0, len(p.Items))
	for _, it := range p.Items {
		items = append(items, pesananItemDoc{
			Nama:     it.Nama,
			Qty:      it.Qty,
			Satuan:   it.Satuan,
			Harga:    it.Harga,
			Subtotal: it.Subtotal,
		})
	}
	return pesananDoc{
		KastamerID:             p.KastamerID,
		AlamatID:               p.AlamatID,
		Items:                  items,
		Deskripsi:              p.Deskripsi,
		Ongkir:                 p.Ongkir,
		CatatanPesanan:         p.CatatanPesanan,
		MetodePembayaran:       p.MetodePembayaran,
		DetailPembayaran:       p.DetailPembayaran,
		MetodePengiriman:       p.MetodePengiriman,
		TotalHarga:             p.TotalHarga,
		StatusPengiriman:       p.StatusPengiriman,
		StatusPembayaran:       p.StatusPembayaran,
		Status:                 p.Status,
		KodePromo:              p.KodePromo,
		TanggalAntar:           p.TanggalAntar,
		TanggalKonfirmasiAntar: p.TanggalKonfirmasiAntar,
		TanggalBayar:           p.TanggalBayar,
		CreatedAt:              p.CreatedAt,
		UpdatedAt:              p.UpdatedAt,
	}
}

func pesananFromDoc(id string, doc pesananDoc) domain.Pesanan {
	items := make([]domain.PesananItem, 0, len(doc.Items))
	for _, it := range doc.Items {
		items = append(items, domain.PesananItem{
			Nama:     it.Nama,
			Qty:      it.Qty,
			Satuan:   it.Satuan,
			Harga:    it.Harga,
			Subtotal: it.Subtotal,
		})
	}
	return domain.Pesanan{
		ID:                     id,
		KastamerID:             doc.KastamerID,
		AlamatID:               doc.AlamatID,
		Items:                  items,
		Deskripsi:              doc.Deskripsi,
		Ongkir:                 doc.Ongkir,
		CatatanPesanan:         doc.CatatanPesanan,
		MetodePembayaran:       doc.MetodePembayaran,
		DetailPembayaran:       doc.DetailPembayaran,
		MetodePengiriman:       doc.MetodePengiriman,
		TotalHarga:             doc.TotalHarga,
		StatusPengiriman:       doc.StatusPengiriman,
		StatusPembayaran:       doc.StatusPembayaran,
		Status:                 doc.Status,
		KodePromo:              doc.KodePromo,
		TanggalAntar:           doc.TanggalAntar,
		TanggalKonfirmasiAntar: doc.TanggalKonfirmasiAntar,
		TanggalBayar:           doc.TanggalBayar,
		CreatedAt:              doc.CreatedAt,
		UpdatedAt:              doc.UpdatedAt,
	}
}
