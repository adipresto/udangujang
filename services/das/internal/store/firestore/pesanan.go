package firestore

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"udangujang/das/internal/domain"
)

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
