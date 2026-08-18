package migrate

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	return db
}

func TestRunnerAppliesMigrationsInVersionOrderAndSkipsApplied(t *testing.T) {
	db := newTestDB(t)
	runner := NewRunner(db)
	migrations := []Migration{
		{Version: "002", Name: "second", SQL: `INSERT INTO events (name) VALUES ('second')`},
		{Version: "001", Name: "first", SQL: `CREATE TABLE events (name TEXT); INSERT INTO events (name) VALUES ('first')`},
	}

	require.NoError(t, runner.Run(migrations))
	require.NoError(t, runner.Run(migrations))

	var names []string
	require.NoError(t, db.Raw("SELECT name FROM events ORDER BY rowid").Scan(&names).Error)
	require.Equal(t, []string{"first", "second"}, names)
}

func TestRunnerDoesNotRegisterFailedMigration(t *testing.T) {
	db := newTestDB(t)
	runner := NewRunner(db)

	err := runner.Run([]Migration{{Version: "001", Name: "broken", SQL: "INVALID SQL"}})
	require.Error(t, err)

	var count int64
	require.NoError(t, db.Table("schema_migrations").Where("version = ?", "001").Count(&count).Error)
	require.Zero(t, count)
}

func TestRunnerRejectsChecksumDrift(t *testing.T) {
	db := newTestDB(t)
	runner := NewRunner(db)
	require.NoError(t, runner.Run([]Migration{
		{Version: "001", Name: "create", SQL: "CREATE TABLE things (id INTEGER)"},
	}))

	err := runner.Run([]Migration{
		{Version: "001", Name: "create", SQL: "CREATE TABLE changed (id INTEGER)"},
	})
	require.Error(t, err)
	require.True(t, strings.Contains(err.Error(), "校验和"), err)
}

func TestRunnerBaseline004ValidatesSchemaAndRegistersRealChecksums(t *testing.T) {
	db := newTestDB(t)
	createBaseline004Schema(t, db)
	runner := NewRunner(db)
	migrations := []Migration{
		{Version: "005", Name: "next", SQL: "CREATE TABLE after_baseline (id INTEGER)"},
		{Version: "001", Name: "init", SQL: "THIS MUST NOT RUN"},
		{Version: "004", Name: "finalize", SQL: "THIS MUST NOT RUN"},
		{Version: "002", Name: "phone", SQL: "THIS MUST NOT RUN"},
		{Version: "003", Name: "tables", SQL: "THIS MUST NOT RUN"},
	}

	require.NoError(t, runner.Run(migrations, "004"))
	require.True(t, db.Migrator().HasTable("after_baseline"))

	var applied []struct {
		Version  string
		Checksum string
	}
	require.NoError(t, db.Table("schema_migrations").
		Select("version, checksum").Order("version").Find(&applied).Error)
	require.Len(t, applied, 5)
	for i, migration := range []Migration{migrations[1], migrations[3], migrations[4], migrations[2]} {
		require.Equal(t, migration.Version, applied[i].Version)
		require.Equal(t, checksumOf(migration.SQL), applied[i].Checksum)
	}
}

func TestRunnerBaseline004RejectsMissingCoreColumnWithoutRegistration(t *testing.T) {
	db := newTestDB(t)
	createBaseline004Schema(t, db)
	require.NoError(t, db.Exec("ALTER TABLE calendar_records DROP COLUMN table_id").Error)

	err := NewRunner(db).Run([]Migration{
		{Version: "001", Name: "init", SQL: "THIS MUST NOT RUN"},
		{Version: "002", Name: "phone", SQL: "THIS MUST NOT RUN"},
		{Version: "003", Name: "tables", SQL: "THIS MUST NOT RUN"},
		{Version: "004", Name: "finalize", SQL: "THIS MUST NOT RUN"},
	}, "004")
	require.ErrorContains(t, err, "calendar_records.table_id")

	var count int64
	require.NoError(t, db.Table("schema_migrations").Count(&count).Error)
	require.Zero(t, count)
}

func TestRunnerBaseline004RegistrationIsAtomic(t *testing.T) {
	db := newTestDB(t)
	createBaseline004Schema(t, db)
	require.NoError(t, db.Exec(`
		CREATE TABLE schema_migrations (
			version VARCHAR(64) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			checksum VARCHAR(64) NOT NULL,
			applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`).Error)
	require.NoError(t, db.Exec(`
		CREATE TRIGGER reject_003
		BEFORE INSERT ON schema_migrations
		WHEN NEW.version = '003'
		BEGIN
			SELECT RAISE(ABORT, 'reject 003');
		END
	`).Error)

	err := NewRunner(db).Run([]Migration{
		{Version: "001", Name: "init", SQL: "THIS MUST NOT RUN"},
		{Version: "002", Name: "phone", SQL: "THIS MUST NOT RUN"},
		{Version: "003", Name: "tables", SQL: "THIS MUST NOT RUN"},
		{Version: "004", Name: "finalize", SQL: "THIS MUST NOT RUN"},
	}, "004")
	require.Error(t, err)

	var count int64
	require.NoError(t, db.Table("schema_migrations").Count(&count).Error)
	require.Zero(t, count)
}

func TestRunnerBaselineRequiresEmptyMigrationTable(t *testing.T) {
	db := newTestDB(t)
	createBaseline004Schema(t, db)
	runner := NewRunner(db)
	require.NoError(t, runner.Run([]Migration{
		{Version: "001", Name: "init", SQL: "CREATE TABLE initial (id INTEGER)"},
	}))

	err := runner.Run([]Migration{
		{Version: "001", Name: "init", SQL: "CREATE TABLE initial (id INTEGER)"},
		{Version: "002", Name: "phone", SQL: "THIS MUST NOT RUN"},
		{Version: "003", Name: "tables", SQL: "THIS MUST NOT RUN"},
		{Version: "004", Name: "finalize", SQL: "THIS MUST NOT RUN"},
	}, "004")
	require.ErrorContains(t, err, "空")
}

func createBaseline004Schema(t *testing.T, db *gorm.DB) {
	t.Helper()
	for _, statement := range []string{
		"CREATE TABLE users (uid TEXT PRIMARY KEY, phone TEXT)",
		"CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT, owner_id TEXT, status TEXT)",
		"CREATE TABLE table_members (id TEXT PRIMARY KEY, table_id TEXT, user_id TEXT, role TEXT, status TEXT)",
		"CREATE TABLE dishes (id TEXT PRIMARY KEY, table_id TEXT)",
		"CREATE TABLE orders (id TEXT PRIMARY KEY, table_id TEXT)",
		"CREATE TABLE calendar_records (id TEXT PRIMARY KEY, table_id TEXT)",
	} {
		require.NoError(t, db.Exec(statement).Error)
	}
}
