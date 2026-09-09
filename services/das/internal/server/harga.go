package server

import (
	"context"
	"errors"
	"fmt"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	"udangujang/das/internal/domain"
	hargav1 "udangujang/das/internal/pb/udangujang/harga/v1"
)

// HargaServer implements hargav1.HargaServiceServer — read-only access to
// config/harga and promo_codes for callers that don't write orders (see
// docs/architecture.md's repository pattern; PesananServer.validatePromo
// remains the write-time check enforced by CreatePesanan).
type HargaServer struct {
	hargav1.UnimplementedHargaServiceServer
	hargaRepo domain.HargaRepository
	promoRepo domain.PromoRepository
}

func NewHargaServer(hargaRepo domain.HargaRepository, promoRepo domain.PromoRepository) *HargaServer {
	return &HargaServer{hargaRepo: hargaRepo, promoRepo: promoRepo}
}

func (s *HargaServer) GetHarga(ctx context.Context, req *hargav1.GetHargaRequest) (*hargav1.GetHargaResponse, error) {
	cfg, err := s.hargaRepo.Get(ctx)
	if err != nil {
		return nil, err
	}
	return &hargav1.GetHargaResponse{Harga: hargaConfigToProto(cfg)}, nil
}

// UpdateHarga ports saveHarga()'s validation and write (reference/
// udang-dashboard/index.html lines ~5124-5148): every HARGA_FIELDS entry
// must be present and >= 0. updated_at on the request is ignored — the
// repository always sets it server-side.
func (s *HargaServer) UpdateHarga(ctx context.Context, req *hargav1.UpdateHargaRequest) (*hargav1.UpdateHargaResponse, error) {
	cfg, err := hargaConfigFromProto(req.GetHarga())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	updated, err := s.hargaRepo.Update(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return &hargav1.UpdateHargaResponse{Harga: hargaConfigToProto(updated)}, nil
}

func (s *HargaServer) ListPromos(ctx context.Context, req *hargav1.ListPromosRequest) (*hargav1.ListPromosResponse, error) {
	promos, err := s.promoRepo.ListPromos(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*hargav1.Promo, 0, len(promos))
	for _, p := range promos {
		out = append(out, promoToProto(p))
	}
	return &hargav1.ListPromosResponse{Promos: out}, nil
}

// CreatePromo requires a non-empty code — everything else mirrors
// savePromo()'s field mapping (reference/udang-dashboard/index.html lines
// ~4930-4970). used_count on the request is ignored, new promos start at 0.
func (s *HargaServer) CreatePromo(ctx context.Context, req *hargav1.CreatePromoRequest) (*hargav1.CreatePromoResponse, error) {
	p, err := promoFromProto(req.GetPromo())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	created, err := s.promoRepo.CreatePromo(ctx, p)
	if err != nil {
		if errors.Is(err, domain.ErrDuplicateCode) {
			return nil, status.Error(codes.AlreadyExists, err.Error())
		}
		return nil, err
	}
	return &hargav1.CreatePromoResponse{Promo: promoToProto(created)}, nil
}

// UpdatePromo requires promo.code to already exist. used_count on the
// request is ignored — the repository preserves the stored value.
func (s *HargaServer) UpdatePromo(ctx context.Context, req *hargav1.UpdatePromoRequest) (*hargav1.UpdatePromoResponse, error) {
	p, err := promoFromProto(req.GetPromo())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	updated, err := s.promoRepo.UpdatePromo(ctx, p)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, status.Error(codes.NotFound, err.Error())
		}
		return nil, err
	}
	return &hargav1.UpdatePromoResponse{Promo: promoToProto(updated)}, nil
}

func (s *HargaServer) DeletePromo(ctx context.Context, req *hargav1.DeletePromoRequest) (*hargav1.DeletePromoResponse, error) {
	if req.GetCode() == "" {
		return nil, status.Error(codes.InvalidArgument, "code wajib diisi")
	}
	if err := s.promoRepo.DeletePromo(ctx, req.GetCode()); err != nil {
		return nil, err
	}
	return &hargav1.DeletePromoResponse{}, nil
}

func (s *HargaServer) SetPromoActive(ctx context.Context, req *hargav1.SetPromoActiveRequest) (*hargav1.SetPromoActiveResponse, error) {
	if req.GetCode() == "" {
		return nil, status.Error(codes.InvalidArgument, "code wajib diisi")
	}
	p, err := s.promoRepo.SetPromoActive(ctx, req.GetCode(), req.GetActive())
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, status.Error(codes.NotFound, err.Error())
		}
		return nil, err
	}
	return &hargav1.SetPromoActiveResponse{Promo: promoToProto(p)}, nil
}

// ValidatePromo ports checkPromoEligibility() verbatim (reference/uua/
// index.html lines 2249-2268), plus the active/expired checks applyPromo()
// did before calling it (lines 3028-3044) — together these are every
// constraint the pre-merge public form checked before letting a promo
// apply. Order of checks matches the reference: active, then expired, then
// eligibility (minKg, maxKg, minKgUtuh, minKgKupas, minSubtotal, maxUses).
func (s *HargaServer) ValidatePromo(ctx context.Context, req *hargav1.ValidatePromoRequest) (*hargav1.ValidatePromoResponse, error) {
	promo, err := s.promoRepo.GetPromo(ctx, req.GetKodePromo())
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return &hargav1.ValidatePromoResponse{Reason: fmt.Sprintf("kode promo %q tidak ditemukan.", req.GetKodePromo())}, nil
		}
		return nil, err
	}

	resp := &hargav1.ValidatePromoResponse{
		Type:        promo.Type,
		Value:       promo.Value,
		MinKg:       promo.MinKg,
		MaxKg:       promo.MaxKg,
		MinKgUtuh:   promo.MinKgUtuh,
		MinKgKupas:  promo.MinKgKupas,
		MinSubtotal: promo.MinSubtotal,
		MaxUses:     int64(promo.MaxUses),
		UsedCount:   int64(promo.UsedCount),
	}

	if !promo.Active {
		resp.Reason = "kode promo sudah tidak aktif."
		return resp, nil
	}
	if !promo.Expires.IsZero() && time.Now().After(promo.Expires) {
		resp.Reason = "kode promo sudah kedaluwarsa."
		return resp, nil
	}

	totalKg := req.GetKgUtuh() + req.GetKgKupas() + req.GetKgExtra()
	switch {
	case promo.MinKg > 0 && totalKg < promo.MinKg:
		resp.Reason = fmt.Sprintf("minimal total %g kg (sekarang %g kg).", promo.MinKg, totalKg)
	case promo.MaxKg > 0 && totalKg > promo.MaxKg:
		resp.Reason = fmt.Sprintf("maksimal total %g kg (sekarang %g kg).", promo.MaxKg, totalKg)
	case promo.MinKgUtuh > 0 && req.GetKgUtuh() < promo.MinKgUtuh:
		resp.Reason = fmt.Sprintf("minimal %g kg udang utuh (sekarang %g kg).", promo.MinKgUtuh, req.GetKgUtuh())
	case promo.MinKgKupas > 0 && req.GetKgKupas() < promo.MinKgKupas:
		resp.Reason = fmt.Sprintf("minimal %g kg udang kupas (sekarang %g kg).", promo.MinKgKupas, req.GetKgKupas())
	case promo.MinSubtotal > 0 && float64(req.GetSubtotal()) < promo.MinSubtotal:
		resp.Reason = fmt.Sprintf("minimal subtotal Rp%s.", formatRibuan(promo.MinSubtotal))
	case promo.MaxUses > 0 && promo.UsedCount >= promo.MaxUses:
		resp.Reason = "kuota promo sudah habis."
	default:
		resp.Valid = true
	}
	return resp, nil
}

// formatRibuan renders a float as a thousands-separated integer string
// (Indonesian toLocaleString('id-ID') equivalent for whole Rupiah amounts).
func formatRibuan(n float64) string {
	return formatRupiah(int64(n))[2:] // strip the "Rp" prefix formatRupiah adds
}

func hargaConfigToProto(cfg domain.HargaConfig) *hargav1.HargaConfig {
	return &hargav1.HargaConfig{
		Udang: &hargav1.HargaUdang{
			PerKg:                  cfg.Udang.PerKg,
			SetengahKg:             cfg.Udang.SetengahKg,
			JasaKupasPerKg:         cfg.Udang.JasaKupasPerKg,
			KupasSetengahSurcharge: cfg.Udang.KupasSetengahSurcharge,
		},
		Cumi: &hargav1.HargaCumi{
			PerKg:      cfg.Cumi.PerKg,
			SetengahKg: cfg.Cumi.SetengahKg,
		},
		Kembung: &hargav1.HargaKembung{
			PerKg:           cfg.Kembung.PerKg,
			SetengahKg:      cfg.Kembung.SetengahKg,
			JasaBersihPerKg: cfg.Kembung.JasaBersihPerKg,
		},
		TeriNasi: &hargav1.HargaTeriNasi{
			PricePerPack: cfg.TeriNasi.PricePerPack,
			KgPerPack:    cfg.TeriNasi.KgPerPack,
			HargaSatuKg:  cfg.TeriNasi.HargaSatuKg,
		},
		Ongkir: &hargav1.HargaOngkir{
			Normal:              cfg.Ongkir.Normal,
			BogorTangerang:      cfg.Ongkir.BogorTangerang,
			MinKgBogorTangerang: cfg.Ongkir.MinKgBogorTangerang,
			MinKgDefault:        cfg.Ongkir.MinKgDefault,
		},
		UpdatedAt: timeToProtoOrNil(cfg.UpdatedAt),
	}
}

func timeToProtoOrNil(t time.Time) *timestamppb.Timestamp {
	if t.IsZero() {
		return nil
	}
	return timestamppb.New(t)
}

// hargaConfigFromProto validates every HARGA_FIELDS entry is present and
// >= 0, matching saveHarga()'s validation (reference/udang-dashboard/
// index.html lines ~5124-5133). req itself (not just req.Harga) is checked
// so a missing top-level message also produces a clear error instead of a
// nil-pointer zero-value config.
func hargaConfigFromProto(h *hargav1.HargaConfig) (domain.HargaConfig, error) {
	if h == nil || h.GetUdang() == nil || h.GetCumi() == nil || h.GetKembung() == nil || h.GetTeriNasi() == nil || h.GetOngkir() == nil {
		return domain.HargaConfig{}, fmt.Errorf("harga: semua field udang/cumi/kembung/teriNasi/ongkir wajib diisi")
	}
	fields := map[string]float64{
		"udang.perKg":                  float64(h.GetUdang().GetPerKg()),
		"udang.setengahKg":             float64(h.GetUdang().GetSetengahKg()),
		"udang.jasaKupasPerKg":         float64(h.GetUdang().GetJasaKupasPerKg()),
		"udang.kupasSetengahSurcharge": float64(h.GetUdang().GetKupasSetengahSurcharge()),
		"cumi.perKg":                   float64(h.GetCumi().GetPerKg()),
		"cumi.setengahKg":              float64(h.GetCumi().GetSetengahKg()),
		"kembung.perKg":                float64(h.GetKembung().GetPerKg()),
		"kembung.setengahKg":           float64(h.GetKembung().GetSetengahKg()),
		"kembung.jasaBersihPerKg":      float64(h.GetKembung().GetJasaBersihPerKg()),
		"teriNasi.pricePerPack":        float64(h.GetTeriNasi().GetPricePerPack()),
		"teriNasi.kgPerPack":           h.GetTeriNasi().GetKgPerPack(),
		"teriNasi.hargaSatuKg":         float64(h.GetTeriNasi().GetHargaSatuKg()),
		"ongkir.normal":                float64(h.GetOngkir().GetNormal()),
		"ongkir.bogorTangerang":        float64(h.GetOngkir().GetBogorTangerang()),
		"ongkir.minKgBogorTangerang":   h.GetOngkir().GetMinKgBogorTangerang(),
		"ongkir.minKgDefault":          h.GetOngkir().GetMinKgDefault(),
	}
	for path, v := range fields {
		if v < 0 {
			return domain.HargaConfig{}, fmt.Errorf("harga: field %q harus diisi angka >= 0", path)
		}
	}

	var cfg domain.HargaConfig
	cfg.Udang.PerKg = h.GetUdang().GetPerKg()
	cfg.Udang.SetengahKg = h.GetUdang().GetSetengahKg()
	cfg.Udang.JasaKupasPerKg = h.GetUdang().GetJasaKupasPerKg()
	cfg.Udang.KupasSetengahSurcharge = h.GetUdang().GetKupasSetengahSurcharge()
	cfg.Cumi.PerKg = h.GetCumi().GetPerKg()
	cfg.Cumi.SetengahKg = h.GetCumi().GetSetengahKg()
	cfg.Kembung.PerKg = h.GetKembung().GetPerKg()
	cfg.Kembung.SetengahKg = h.GetKembung().GetSetengahKg()
	cfg.Kembung.JasaBersihPerKg = h.GetKembung().GetJasaBersihPerKg()
	cfg.TeriNasi.PricePerPack = h.GetTeriNasi().GetPricePerPack()
	cfg.TeriNasi.KgPerPack = h.GetTeriNasi().GetKgPerPack()
	cfg.TeriNasi.HargaSatuKg = h.GetTeriNasi().GetHargaSatuKg()
	cfg.Ongkir.Normal = h.GetOngkir().GetNormal()
	cfg.Ongkir.BogorTangerang = h.GetOngkir().GetBogorTangerang()
	cfg.Ongkir.MinKgBogorTangerang = h.GetOngkir().GetMinKgBogorTangerang()
	cfg.Ongkir.MinKgDefault = h.GetOngkir().GetMinKgDefault()
	return cfg, nil
}

func promoToProto(p domain.Promo) *hargav1.Promo {
	return &hargav1.Promo{
		Code:        p.Code,
		Type:        p.Type,
		Value:       p.Value,
		Active:      p.Active,
		Expires:     timeToProtoOrNil(p.Expires),
		MinKg:       p.MinKg,
		MaxKg:       p.MaxKg,
		MinKgUtuh:   p.MinKgUtuh,
		MinKgKupas:  p.MinKgKupas,
		MinSubtotal: p.MinSubtotal,
		MaxUses:     int64(p.MaxUses),
		UsedCount:   int64(p.UsedCount),
	}
}

// promoFromProto ports savePromo()'s required-field checks (reference/
// udang-dashboard/index.html lines ~4938-4952): code and a discount value
// (when type is "discount") are mandatory. used_count is intentionally not
// read from the proto — callers cannot set it via Create/UpdatePromo.
func promoFromProto(p *hargav1.Promo) (domain.Promo, error) {
	if p == nil || p.GetCode() == "" {
		return domain.Promo{}, fmt.Errorf("promo: code wajib diisi")
	}
	if p.GetType() == domain.PromoTypeDiscount && p.GetValue() <= 0 {
		return domain.Promo{}, fmt.Errorf("promo: value wajib diisi untuk tipe discount")
	}
	var expires time.Time
	if p.GetExpires() != nil {
		expires = p.GetExpires().AsTime()
	}
	return domain.Promo{
		Code:        p.GetCode(),
		Type:        p.GetType(),
		Value:       p.GetValue(),
		Active:      p.GetActive(),
		Expires:     expires,
		MinKg:       p.GetMinKg(),
		MaxKg:       p.GetMaxKg(),
		MinKgUtuh:   p.GetMinKgUtuh(),
		MinKgKupas:  p.GetMinKgKupas(),
		MinSubtotal: p.GetMinSubtotal(),
		MaxUses:     int(p.GetMaxUses()),
	}, nil
}
