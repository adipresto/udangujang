package server

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	"udangujang/das/internal/domain"
	pesananv1 "udangujang/das/internal/pb/udangujang/pesanan/v1"
)

// noHpPattern accepts digits only, 9-15 long, with an optional leading '+'
// (E.164-ish, permissive enough for Indonesian mobile numbers written with
// or without the country code).
var noHpPattern = regexp.MustCompile(`^\+?[0-9]{9,15}$`)

// PesananServer implements pesananv1.PesananServiceServer. CreatePesanan is
// the only write path for new orders (see docs/architecture.md) — it
// upserts Kastamer by no_hp, reuses-or-creates Alamat, validates any promo
// code, and writes the Pesanan.
type PesananServer struct {
	pesananv1.UnimplementedPesananServiceServer
	pesananRepo  domain.PesananRepository
	kastamerRepo domain.KastamerRepository
	alamatRepo   domain.AlamatRepository
	promoRepo    domain.PromoRepository
}

func NewPesananServer(
	pesananRepo domain.PesananRepository,
	kastamerRepo domain.KastamerRepository,
	alamatRepo domain.AlamatRepository,
	promoRepo domain.PromoRepository,
) *PesananServer {
	return &PesananServer{
		pesananRepo:  pesananRepo,
		kastamerRepo: kastamerRepo,
		alamatRepo:   alamatRepo,
		promoRepo:    promoRepo,
	}
}

func (s *PesananServer) CreatePesanan(ctx context.Context, req *pesananv1.CreatePesananRequest) (*pesananv1.CreatePesananResponse, error) {
	if err := validateCreatePesananRequest(req); err != nil {
		return nil, err
	}

	items, totalKg, itemsSubtotal, err := pesananItemsFromRequest(req.GetItems())
	if err != nil {
		return nil, err
	}

	if req.GetKodePromo() != "" {
		if err := s.validatePromo(ctx, req.GetKodePromo(), totalKg, itemsSubtotal); err != nil {
			return nil, err
		}
	}

	kastamer, err := s.upsertKastamer(ctx, req)
	if err != nil {
		return nil, err
	}

	alamat, err := s.resolveAlamat(ctx, kastamer.ID, req)
	if err != nil {
		return nil, err
	}

	pesanan := domain.Pesanan{
		KastamerID:       kastamer.ID,
		AlamatID:         alamat.ID,
		Items:            items,
		Deskripsi:        req.GetDeskripsi(),
		Ongkir:           req.GetOngkir(),
		CatatanPesanan:   req.GetCatatanPesanan(),
		MetodePembayaran: req.GetMetodePembayaran(),
		DetailPembayaran: req.GetDetailPembayaran(),
		MetodePengiriman: req.GetMetodePengiriman(),
		TotalHarga:       formatRupiah(itemsSubtotal + req.GetOngkir()),
		// Every new order starts unpaid, undelivered, regardless of
		// metode_pembayaran — payment/delivery confirmation happens later
		// through a separate status-update flow (UDMC-6), not at creation.
		StatusPengiriman: domain.StatusPengirimanBelumAntar,
		StatusPembayaran: domain.StatusPembayaranBelumBayar,
		KodePromo:        req.GetKodePromo(),
	}
	if req.GetTanggalAntar() != nil {
		pesanan.TanggalAntar = req.GetTanggalAntar().AsTime()
	}

	created, err := s.pesananRepo.Create(ctx, pesanan)
	if err != nil {
		return nil, err
	}

	return &pesananv1.CreatePesananResponse{
		PesananId: created.ID,
		Pesanan:   pesananToProto(created),
	}, nil
}

func (s *PesananServer) ListPesanan(ctx context.Context, req *pesananv1.ListPesananRequest) (*pesananv1.ListPesananResponse, error) {
	filter := domain.PesananFilter{
		StatusPengiriman: req.GetStatusPengiriman(),
		StatusPembayaran: req.GetStatusPembayaran(),
		Limit:            int(req.GetLimit()),
	}
	if req.GetTanggalDari() != nil {
		filter.TanggalDari = req.GetTanggalDari().AsTime()
	}
	if req.GetTanggalSampai() != nil {
		filter.TanggalSampai = req.GetTanggalSampai().AsTime()
	}

	list, err := s.pesananRepo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	out := make([]*pesananv1.Pesanan, 0, len(list))
	for _, p := range list {
		out = append(out, pesananToProto(p))
	}
	return &pesananv1.ListPesananResponse{Pesanan: out}, nil
}

func (s *PesananServer) GetPesananDetail(ctx context.Context, req *pesananv1.GetPesananDetailRequest) (*pesananv1.GetPesananDetailResponse, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id wajib diisi")
	}

	detail, err := s.pesananRepo.GetDetail(ctx, req.GetId())
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "pesanan %q tidak ditemukan", req.GetId())
		}
		return nil, err
	}

	logs := make([]*pesananv1.StatusLog, 0, len(detail.StatusLog))
	for _, l := range detail.StatusLog {
		logs = append(logs, statusLogToProto(l))
	}

	return &pesananv1.GetPesananDetailResponse{
		Pesanan:   pesananToProto(detail.Pesanan),
		Kastamer:  kastamerToProto(detail.Kastamer),
		Alamat:    alamatToProto(detail.Alamat),
		StatusLog: logs,
	}, nil
}

func (s *PesananServer) UpdateStatusPesanan(ctx context.Context, req *pesananv1.UpdateStatusPesananRequest) (*pesananv1.UpdateStatusPesananResponse, error) {
	if req.GetId() == "" {
		return nil, status.Error(codes.InvalidArgument, "id wajib diisi")
	}
	if req.StatusPengiriman == nil && req.StatusPembayaran == nil {
		return nil, status.Error(codes.InvalidArgument, "status_pengiriman atau status_pembayaran wajib diisi")
	}

	updated, err := s.pesananRepo.UpdateStatus(ctx, req.GetId(), req.StatusPengiriman, req.StatusPembayaran)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, status.Errorf(codes.NotFound, "pesanan %q tidak ditemukan", req.GetId())
		}
		return nil, err
	}

	return &pesananv1.UpdateStatusPesananResponse{Pesanan: pesananToProto(updated)}, nil
}

func validateCreatePesananRequest(req *pesananv1.CreatePesananRequest) error {
	if req.GetNama() == "" {
		return status.Error(codes.InvalidArgument, "nama wajib diisi")
	}
	if !noHpPattern.MatchString(req.GetNoHp()) {
		return status.Error(codes.InvalidArgument, "no_hp tidak valid: harus 9-15 digit, boleh diawali +")
	}
	if req.GetAlamat() == "" {
		return status.Error(codes.InvalidArgument, "alamat wajib diisi")
	}
	if req.GetMetodePembayaran() == "" {
		return status.Error(codes.InvalidArgument, "metode_pembayaran wajib diisi")
	}
	if req.GetMetodePengiriman() == "" {
		return status.Error(codes.InvalidArgument, "metode_pengiriman wajib diisi")
	}
	if len(req.GetItems()) == 0 {
		return status.Error(codes.InvalidArgument, "items wajib diisi minimal 1")
	}
	return nil
}

func pesananItemsFromRequest(in []*pesananv1.PesananItemInput) (items []domain.PesananItem, totalKg float64, subtotal int64, err error) {
	items = make([]domain.PesananItem, 0, len(in))
	for _, it := range in {
		if it.GetNama() == "" {
			return nil, 0, 0, status.Error(codes.InvalidArgument, "item nama wajib diisi")
		}
		if it.GetQty() <= 0 {
			return nil, 0, 0, status.Error(codes.InvalidArgument, fmt.Sprintf("item %q: qty harus lebih dari 0", it.GetNama()))
		}
		lineSubtotal := int64(it.GetQty() * float64(it.GetHarga()))
		items = append(items, domain.PesananItem{
			Nama:     it.GetNama(),
			Qty:      it.GetQty(),
			Satuan:   it.GetSatuan(),
			Harga:    it.GetHarga(),
			Subtotal: lineSubtotal,
		})
		totalKg += it.GetQty()
		subtotal += lineSubtotal
	}
	return items, totalKg, subtotal, nil
}

// validatePromo checks a kode_promo against promo_codes: it must exist, be
// active, not expired, still have uses left, and meet whichever minimum
// threshold it declares (minKg/minKgUtuh/minKgKupas/minSubtotal, only
// enforced when >0 — see docs/migration-context.md § shared/promo_codes).
// This only validates; applying the discount to total_harga and
// incrementing usedCount are out of scope for this ticket's acceptance
// criteria (see docs/migration-context.md's separate incrementPromoUsage()
// step in the pre-merge flow).
func (s *PesananServer) validatePromo(ctx context.Context, code string, totalKg float64, subtotal int64) error {
	promo, err := s.promoRepo.GetPromo(ctx, code)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return status.Errorf(codes.InvalidArgument, "kode promo %q tidak ditemukan", code)
		}
		return err
	}
	if !promo.Active {
		return status.Errorf(codes.InvalidArgument, "kode promo %q sudah tidak aktif", code)
	}
	if !promo.Expires.IsZero() && time.Now().After(promo.Expires) {
		return status.Errorf(codes.InvalidArgument, "kode promo %q sudah kedaluwarsa", code)
	}
	if promo.MaxUses > 0 && promo.UsedCount >= promo.MaxUses {
		return status.Errorf(codes.InvalidArgument, "kode promo %q sudah mencapai batas penggunaan", code)
	}
	if promo.MinKg > 0 && totalKg < promo.MinKg {
		return status.Errorf(codes.InvalidArgument, "kode promo %q butuh minimal %.2f kg", code, promo.MinKg)
	}
	if promo.MinSubtotal > 0 && float64(subtotal) < promo.MinSubtotal {
		return status.Errorf(codes.InvalidArgument, "kode promo %q butuh minimal subtotal %.0f", code, promo.MinSubtotal)
	}
	return nil
}

func (s *PesananServer) upsertKastamer(ctx context.Context, req *pesananv1.CreatePesananRequest) (domain.Kastamer, error) {
	kastamer, err := s.kastamerRepo.GetByNoHp(ctx, req.GetNoHp())
	if err == nil {
		return kastamer, nil
	}
	if !errors.Is(err, domain.ErrNotFound) {
		return domain.Kastamer{}, err
	}
	return s.kastamerRepo.Create(ctx, domain.Kastamer{
		Nama:    req.GetNama(),
		NoHp:    req.GetNoHp(),
		Catatan: req.GetCatatan(),
	})
}

// resolveAlamat reuses an existing Alamat when alamat_id names one
// belonging to this kastamer, or when an existing Alamat's `alamat` string
// matches exactly; otherwise it creates a new one (see pesanan.proto).
func (s *PesananServer) resolveAlamat(ctx context.Context, kastamerID string, req *pesananv1.CreatePesananRequest) (domain.Alamat, error) {
	existing, err := s.alamatRepo.ListByKastamer(ctx, kastamerID)
	if err != nil {
		return domain.Alamat{}, err
	}

	if req.GetAlamatId() != "" {
		for _, a := range existing {
			if a.ID == req.GetAlamatId() {
				return a, nil
			}
		}
	}
	for _, a := range existing {
		if a.Alamat == req.GetAlamat() {
			return a, nil
		}
	}

	return s.alamatRepo.Create(ctx, domain.Alamat{
		KastamerID: kastamerID,
		WilayahID:  req.GetWilayahId(),
		Label:      req.GetLabel(),
		Alamat:     req.GetAlamat(),
		Lat:        req.GetLat(),
		Lng:        req.GetLng(),
		MapsLink:   req.GetMapsLink(),
		IsDefault:  len(existing) == 0,
	})
}

// formatRupiah renders a whole-Rupiah amount as "RpN.NNN.NNN", matching the
// pre-merge dashboard's thousands-separated display format.
func formatRupiah(amount int64) string {
	sign := ""
	if amount < 0 {
		sign = "-"
		amount = -amount
	}
	digits := fmt.Sprintf("%d", amount)
	var grouped []byte
	for i, d := range []byte(digits) {
		if i > 0 && (len(digits)-i)%3 == 0 {
			grouped = append(grouped, '.')
		}
		grouped = append(grouped, d)
	}
	return fmt.Sprintf("Rp%s%s", sign, grouped)
}

func pesananToProto(p domain.Pesanan) *pesananv1.Pesanan {
	items := make([]*pesananv1.PesananItem, 0, len(p.Items))
	for _, it := range p.Items {
		items = append(items, &pesananv1.PesananItem{
			Nama:     it.Nama,
			Qty:      it.Qty,
			Satuan:   it.Satuan,
			Harga:    it.Harga,
			Subtotal: it.Subtotal,
		})
	}
	out := &pesananv1.Pesanan{
		Id:               p.ID,
		KastamerId:       p.KastamerID,
		AlamatId:         p.AlamatID,
		Items:            items,
		Deskripsi:        p.Deskripsi,
		Ongkir:           p.Ongkir,
		CatatanPesanan:   p.CatatanPesanan,
		MetodePembayaran: p.MetodePembayaran,
		DetailPembayaran: p.DetailPembayaran,
		MetodePengiriman: p.MetodePengiriman,
		TotalHarga:       p.TotalHarga,
		StatusPengiriman: p.StatusPengiriman,
		StatusPembayaran: p.StatusPembayaran,
		Status:           p.Status,
		KodePromo:        p.KodePromo,
		CreatedAt:        timestamppb.New(p.CreatedAt),
		UpdatedAt:        timestamppb.New(p.UpdatedAt),
	}
	if !p.TanggalAntar.IsZero() {
		out.TanggalAntar = timestamppb.New(p.TanggalAntar)
	}
	if !p.TanggalKonfirmasiAntar.IsZero() {
		out.TanggalKonfirmasiAntar = timestamppb.New(p.TanggalKonfirmasiAntar)
	}
	if !p.TanggalBayar.IsZero() {
		out.TanggalBayar = timestamppb.New(p.TanggalBayar)
	}
	return out
}

func statusLogToProto(l domain.StatusLog) *pesananv1.StatusLog {
	return &pesananv1.StatusLog{
		Id:          l.ID,
		PesananId:   l.PesananID,
		StatusLama:  l.StatusLama,
		StatusBaru:  l.StatusBaru,
		JenisStatus: l.JenisStatus,
		ChangedAt:   timestamppb.New(l.ChangedAt),
	}
}
