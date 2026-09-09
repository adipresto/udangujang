package server

import (
	"context"
	"errors"
	"fmt"
	"time"

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
	}
}
