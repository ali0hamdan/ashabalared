-- Add ASSIGNED to distribution workflow (Prisma enum already includes it; DB enum must match).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'DistributionStatus'
      AND e.enumlabel = 'ASSIGNED'
  ) THEN
    ALTER TYPE "DistributionStatus" ADD VALUE 'ASSIGNED';
  END IF;
END $$;
