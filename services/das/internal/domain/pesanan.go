package domain

import (
	"context"
	"time"
)

// Pesanan status values — see docs/migration-context.md § pesanan.
// CreatePesanan always writes StatusPengirimanBelumAntar /
// StatusPembayaranBelumBayar; payment/delivery confirmation happens later
// through a separate status-update flow (UDMC-6), not at creation.
const (
	StatusPengirimanBelumAntar = "belum_antar"
	StatusPengirimanSudahAntar = "sudah_antar"

	StatusPembayaranBelumBayar = "belum_bayar"
	StatusPembayaranSudahBayar = "sudah_bayar"
)

// PesananItem is one line item of a Pesanan — nama/qty/satuan/harga/subtotal
// mirror the pre-merge schema's items[] entries (see
// docs/migration-context.md § pesanan). Qty is a weight or pack count and
// can be fractional (e.g. 0.5 kg); harga/subtotal are whole Rupiah amounts.
type PesananItem struct {
	Nama     string
	Qty      float64
	Satuan   string
	Harga    int64
	Subtotal int64
}

// Pesanan is a customer order. TotalHarga stays a formatted Rupiah string
// (not a number) for compatibility with the pre-merge dashboard schema,
// which already reads/writes it as a string — see
// docs/migration-context.md § pesanan. Status is the pre-merge doc's
// legacy free-form field, carried through as-is.
type Pesanan struct {
	ID                     string
	KastamerID             string
	AlamatID               string
	Items                  []PesananItem
	Deskripsi              string
	Ongkir                 int64
	CatatanPesanan         string
	MetodePembayaran       string
	DetailPembayaran       string
	MetodePengiriman       string
	TotalHarga             string
	StatusPengiriman       string
	StatusPembayaran       string
	Status                 string
	KodePromo              string
	TanggalAntar           time.Time
	TanggalKonfirmasiAntar time.Time
	TanggalBayar           time.Time
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

// PesananRepository is the only write path for new orders — see
// docs/architecture.md's repository pattern. List/GetDetail/UpdateStatus
// back the admin dashboard's pesanan list, detail panel, and status
// toggles (UDMC-6) — see docs/migration-context.md § pesanan.
type PesananRepository interface {
	Create(ctx context.Context, p Pesanan) (Pesanan, error)
	GetByID(ctx context.Context, id string) (Pesanan, error)
	List(ctx context.Context, filter PesananFilter) ([]Pesanan, error)
	GetDetail(ctx context.Context, id string) (PesananDetail, error)
	// UpdateStatus changes only the status fields whose pointer is
	// non-nil, writing a StatusLog entry per field that actually changes
	// value and setting TanggalKonfirmasiAntar/TanggalBayar the first
	// time that field flips to sudah_antar/sudah_bayar — verbatim
	// quickStatus() behavior from the pre-merge dashboard (see
	// reference/udang-dashboard/index.html's quickStatus()).
	UpdateStatus(ctx context.Context, id string, statusPengiriman, statusPembayaran *string) (Pesanan, error)
}

// JenisStatus values distinguish which status field a StatusLog entry
// tracks — mirrors quickStatus()'s `field` parameter (see
// reference/udang-dashboard/index.html).
const (
	JenisStatusPengiriman = "pengiriman"
	JenisStatusPembayaran = "pembayaran"
)

// StatusLog is one audit-trail entry for a status change on a Pesanan —
// mirrors the pre-merge dashboard's statusLog doc shape (see
// reference/udang-dashboard/index.html's LOG_STATUS action).
type StatusLog struct {
	ID          string
	PesananID   string
	StatusLama  string
	StatusBaru  string
	JenisStatus string
	ChangedAt   time.Time
}

// PesananFilter narrows List() by delivery date range (against
// TanggalAntar) and/or exact status match; zero values mean "no filter" on
// that dimension. Limit <= 0 means unlimited.
type PesananFilter struct {
	TanggalDari      time.Time
	TanggalSampai    time.Time
	StatusPengiriman string
	StatusPembayaran string
	Limit            int
}

// PesananDetail is a Pesanan joined with its Kastamer, Alamat, and audit
// trail — the admin dashboard's pesanan detail panel reads all four
// together (see docs/migration-context.md § pesanan).
type PesananDetail struct {
	Pesanan   Pesanan
	Kastamer  Kastamer
	Alamat    Alamat
	StatusLog []StatusLog
}

// Promo types — see docs/migration-context.md § shared/promo_codes.
const (
	PromoTypeDiscount    = "discount"
	PromoTypeFreeProduct = "free_product"
	PromoTypeFreeOngkir  = "free_ongkir"
)

// Promo mirrors a promo_codes doc (doc ID = uppercase code, carried
// separately as Code). MinKg/MaxKg/MinKgUtuh/MinKgKupas/MinSubtotal are zero
// when unset — the pre-merge schema only ever set them when >0 (see
// docs/migration-context.md § shared/promo_codes). MaxKg isn't documented in
// migration-context.md but is a real field written by the pre-merge
// dashboard's promo editor and read by checkPromoEligibility() (reference/
// uua/index.html line 2255) — added here so ValidatePromo can port that
// check verbatim.
type Promo struct {
	Code        string
	Type        string
	Value       float64
	Active      bool
	Expires     time.Time
	MinKg       float64
	MaxKg       float64
	MinKgUtuh   float64
	MinKgKupas  float64
	MinSubtotal float64
	MaxUses     int
	UsedCount   int
}

// PromoRepository looks up and manages promo_codes. GetPromo/UpdatePromo/
// DeletePromo/SetPromoActive return ErrNotFound when the code doesn't
// exist; CreatePromo returns ErrDuplicateCode when it already does. Write
// methods never let the caller set UsedCount — CreatePromo always starts
// it at 0, the others preserve whatever is already stored (see
// docs/migration-context.md § shared/promo_codes: usedCount only changes
// via the payment-confirmation flow, not this admin editor).
type PromoRepository interface {
	GetPromo(ctx context.Context, code string) (Promo, error)
	ListPromos(ctx context.Context) ([]Promo, error)
	CreatePromo(ctx context.Context, p Promo) (Promo, error)
	UpdatePromo(ctx context.Context, p Promo) (Promo, error)
	DeletePromo(ctx context.Context, code string) error
	SetPromoActive(ctx context.Context, code string, active bool) (Promo, error)
}

// HargaConfig mirrors the config/harga singleton doc — see
// docs/migration-context.md § shared/config/harga. Non-linear entries
// (udang kupas ½kg, kembung ½kg, teri nasi 1kg) are intentional, not bugs —
// do not simplify them into a proportional formula.
type HargaConfig struct {
	Udang struct {
		PerKg                  int64
		SetengahKg             int64
		JasaKupasPerKg         int64
		KupasSetengahSurcharge int64
	}
	Cumi struct {
		PerKg      int64
		SetengahKg int64
	}
	Kembung struct {
		PerKg           int64
		SetengahKg      int64
		JasaBersihPerKg int64
	}
	TeriNasi struct {
		PricePerPack int64
		KgPerPack    float64
		HargaSatuKg  int64
	}
	Ongkir struct {
		Normal              int64
		BogorTangerang      int64
		MinKgBogorTangerang float64
		MinKgDefault        float64
	}
	UpdatedAt time.Time
}

// HargaRepository reads and writes the config/harga singleton. Get is not
// yet consumed by CreatePesanan (server-side price/ongkir recomputation is
// out of scope for UDMC-3's acceptance criteria) — wired up for a
// follow-up ticket. Update always replaces the full doc and sets UpdatedAt
// server-side, ignoring whatever the caller passed in (mirrors
// saveHarga()'s setDoc — reference/udang-dashboard/index.html lines
// ~5124-5148).
type HargaRepository interface {
	Get(ctx context.Context) (HargaConfig, error)
	Update(ctx context.Context, cfg HargaConfig) (HargaConfig, error)
}
