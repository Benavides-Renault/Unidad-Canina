ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Preserve existing accounts and all relationships. UUID-derived names cannot collide.
UPDATE "User" SET "username" = 'usuario_' || replace(id::text, '-', '');
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
ALTER TABLE "User" ADD CONSTRAINT "User_username_format"
  CHECK ("username" ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
