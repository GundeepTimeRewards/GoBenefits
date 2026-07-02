-- Runs automatically on first container start. Creates the empty databases;
-- schema + seed are applied separately by `bun local/setup.ts`.
CREATE DATABASE IF NOT EXISTS control_plane   CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS cust_employer_a  CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS cust_employer_b  CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS cust_employer_c  CHARACTER SET utf8mb4;  -- archived/disabled-employer test
