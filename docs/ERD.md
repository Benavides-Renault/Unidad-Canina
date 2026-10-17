# Modelo de datos implementado

Fuente normativa: `apps/api/prisma/schema.prisma` y sus migraciones. El diagrama muestra relaciones relacionales principales; `actorId`/`recordedBy` conservan identidad histórica y no deben interpretarse como una autorización.

```mermaid
erDiagram
  Party ||--o{ User : vincula
  Party ||--o{ Dog : posee
  Party ||--o{ Dog : custodia
  User |o--o{ Dog : entrenador_asignado
  Dog ||--o{ MedicalEntry : historial_medico
  User ||--o{ MedicalEntry : registra
  User ||--o{ Session : tiene
  User ||--o{ PasswordReset : recupera
  User ||--o{ Reminder : recibe
  User ||--o{ Notification : recibe
  Reminder ||--o| Notification : origina
  Dog ||--o{ Vaccination : registra
  Dog ||--o{ Weight : pesa
  Dog ||--o{ Movement : ubica
  Dog ||--o{ TrainingSession : entrena
  Dog ||--o{ Appointment : agenda
  Dog ||--o{ Document : protege
  User {
    uuid id PK
    string username UK
    string email UK
    string passwordHash
    enum role
    boolean active
    string totpSecret
  }
  Session {
    uuid id PK
    string tokenHash UK
    uuid userId FK
    timestamptz expiresAt
  }
  Dog {
    uuid id PK
    string code UK
    string microchip UK
    date birthDate
    enum administrativeStatus
    enum workStatus
    enum reproductiveStatus
    enum availability
    timestamptz archivedAt
  }
  Document {
    uuid id PK
    uuid dogId FK
    string storageKey UK
    string checksum
    string mimeType
    int size
    enum category
  }
  Reminder {
    uuid id PK
    string dedupeKey UK
    uuid userId FK
    timestamptz dueAt
    enum status
    int attempts
    timestamptz lockedAt
  }
  AuditLog {
    uuid id PK
    uuid actorId
    uuid dogId
    string entity
    string action
    string summary
    timestamptz createdAt
  }
```

Los índices por perro/fecha permiten historiales; los de vencimiento y estado/fecha permiten reclamar recordatorios. La tabla `RateLimit` guarda límites de intentos persistentes. `AuditLog` mantiene trazabilidad independiente del ciclo de vida del actor/expediente; no hay endpoint de edición ni eliminación de auditoría.

```mermaid
erDiagram
  Institution ||--o{ Contact : contactos
  Institution ||--o{ Contract : acuerdos
  Contract ||--o{ ContractVersion : revisiones
  Contract ||--o{ ContractFile : archivos
  Contract ||--o{ Assignment : asignaciones
  Dog ||--o{ Assignment : servicio
  Contract ||--o{ ServiceLog : bitacora
  Dog ||--o| BreedingProfile : ascendencia
  Dog ||--o{ BreedingEvent : controles
  Dog ||--o{ BreedingPlan : progenitor
  BreedingPlan o|--o| Litter : nacimiento
  Litter ||--o{ Dog : cachorros
  Litter ||--o{ Reservation : apartados
  Dog o|--o{ Reservation : cachorro
  Reservation o|--|| Account : cuenta
  Account ||--o{ Payment : movimientos
  Account ||--o{ AccountFile : comprobantes
  Product ||--o{ StockLot : lotes
  StockLot ||--o{ StockMovement : movimientos
```

`Dog.isPuppy` distingue el directorio de camadas del de la unidad; la incorporación conserva el mismo UUID. `BreedingProfile` referencia padres Dog y documenta procedencia. `Account` admite referencias a Dog/Litter/Contract; importes Decimal(18,2), cambio Decimal(18,6). Inventario usa Decimal(18,3). Pagos, movimientos de stock y versiones contractuales tienen triggers contra modificación/eliminación. Un índice parcial impide dos reservas activas/entregadas por cachorro. `ServiceHeartbeat` conserva la última actividad del trabajador sin datos personales.
