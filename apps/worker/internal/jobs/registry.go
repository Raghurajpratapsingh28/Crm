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
		return UnknownType(job.Type)
	}
	return h.Handle(ctx, job)
}

func (r Registry) Has(jobType string) bool {
	_, ok := r[jobType]
	return ok
}

func (r Registry) MustRegister(handler Handler) {
	if handler == nil || handler.Type() == "" {
		panic("invalid job handler")
	}
	if _, exists := r[handler.Type()]; exists {
		panic(fmt.Sprintf("duplicate handler for %s", handler.Type()))
	}
	r[handler.Type()] = handler
}
