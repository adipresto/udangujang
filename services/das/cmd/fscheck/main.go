package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"cloud.google.com/go/firestore"
)

func main() {
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "atminujangudang")
	if err != nil {
		fmt.Printf("FAIL: %v\n", err)
		os.Exit(1)
	}
	defer client.Close()
	docs, err := client.Collection("pesanan").Limit(1).Documents(ctx).GetAll()
	if err != nil || len(docs) == 0 {
		fmt.Printf("FAIL get: %v\n", err)
		os.Exit(1)
	}
	b, _ := json.MarshalIndent(docs[0].Data(), "", "  ")
	fmt.Printf("=== sample pesanan/%s ===\n%s\n", docs[0].Ref.ID, string(b))
}
