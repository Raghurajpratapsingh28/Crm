package jobs

import (
	"context"
	"fmt"
)

type Registry map[string]Handler

func NewRegistry(handlers ...Handler) Registry {
	r := make(Registry, len(handlers))
	for _, h := range handlers {
		r[h.Type()] = h
	}
	return r
}

func (r Registry) Dispatch(ctx context.Context, job Job) error {
	h, ok := r[job.Type]
	if !ok {
		return fmt.Errorf("no handler for job type %q", job.Type)
	}
	return h.Handle(ctx, job)
}
