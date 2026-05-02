#pragma once
#include <stdint.h>

// Dekodiert einen Base32 String (wie das TOTP Secret) in ein Byte-Array.
// Gibt die Anzahl der dekodierten Bytes zurück oder -1 bei einem Fehler.
int base32_decode(const uint8_t *encoded, uint8_t *result, int bufSize);