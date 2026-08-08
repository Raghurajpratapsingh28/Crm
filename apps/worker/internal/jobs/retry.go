package jobs

import (
	"math/rand"
	"time"
)

func Backoff(attempt int, base, max, jitter time.Duration) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	delay := base
	for i := 1; i < attempt; i++ {
		if max > 0 && delay > max/2 {
			delay = max
			break
		}
		next := delay * 2
		if next < delay {
			delay = max
			break
		}
		delay = next
	}
	if max > 0 && delay > max {
		delay = max
	}
	if jitter > 0 {
		delay += time.Duration(rand.Int63n(int64(jitter) + 1))
	}
	return delay
}

func TruncateError(err error, max int) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if max <= 0 || len(msg) <= max {
		return msg
	}
	return msg[:max]
}
