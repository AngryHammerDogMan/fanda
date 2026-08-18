// Package migrate applies immutable, versioned SQL migrations.
package migrate

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gorm.io/gorm"
)

// advisoryLockID 是应用级 PostgreSQL advisory lock 标识，避免多个进程同时跑迁移。
const advisoryLockID int64 = 706_263_202_608_18

// Migration 表示一个已从文件系统读取的不可变 SQL 迁移文件。
type Migration struct {
	// Version 来自文件名前缀，用于排序和幂等登记。
	Version string
	// Name 来自文件名后缀，便于 schema_migrations 表展示。
	Name string
	// SQL 是迁移文件原文，校验和基于该内容计算。
	SQL string
}

// Runner 持有迁移执行所需的数据库连接。
type Runner struct {
	db *gorm.DB
}

// requiredColumn 描述 baseline 校验时必须存在的表列。
type requiredColumn struct {
	table  string
	column string
}

// baseline004RequiredColumns 是从旧库直接接入 004 baseline 前必须验证的核心列集合。
var baseline004RequiredColumns = []requiredColumn{
	{table: "users", column: "uid"},
	{table: "tables", column: "id"},
	{table: "tables", column: "type"},
	{table: "tables", column: "owner_id"},
	{table: "tables", column: "status"},
	{table: "table_members", column: "table_id"},
	{table: "table_members", column: "user_id"},
	{table: "table_members", column: "role"},
	{table: "table_members", column: "status"},
	{table: "dishes", column: "table_id"},
	{table: "orders", column: "table_id"},
	{table: "calendar_records", column: "table_id"},
}

// NewRunner 创建迁移执行器，调用方负责传入已连通的数据库连接。
func NewRunner(db *gorm.DB) *Runner {
	return &Runner{db: db}
}

// LoadDir 读取目录中的 .sql 文件，要求文件名格式为 <version>_<name>.sql。
func LoadDir(dir string) ([]Migration, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("读取迁移目录失败: %w", err)
	}
	var migrations []Migration
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}
		parts := strings.SplitN(strings.TrimSuffix(entry.Name(), ".sql"), "_", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			return nil, fmt.Errorf("迁移文件名必须为 <version>_<name>.sql: %s", entry.Name())
		}
		content, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("读取迁移 %s 失败: %w", entry.Name(), err)
		}
		migrations = append(migrations, Migration{Version: parts[0], Name: parts[1], SQL: string(content)})
	}
	return migrations, nil
}

// Run 按版本顺序执行迁移；PostgreSQL 下先获取 advisory lock，再登记校验和。
func (r *Runner) Run(migrations []Migration, baseline ...string) error {
	if len(baseline) > 1 {
		return errors.New("只能指定一个 baseline")
	}
	baselineVersion := ""
	if len(baseline) == 1 {
		baselineVersion = baseline[0]
	}
	if r.db.Dialector.Name() != "postgres" {
		return r.runLocked(r.db, migrations, baselineVersion)
	}
	return r.db.Connection(func(db *gorm.DB) error {
		if err := db.Exec("SELECT pg_advisory_lock(?)", advisoryLockID).Error; err != nil {
			return fmt.Errorf("获取迁移锁失败: %w", err)
		}
		defer db.Exec("SELECT pg_advisory_unlock(?)", advisoryLockID)
		return r.runLocked(db, migrations, baselineVersion)
	})
}

// runLocked 在已持有迁移锁的连接上初始化登记表、处理 baseline 并逐个执行迁移。
func (r *Runner) runLocked(db *gorm.DB, migrations []Migration, baselineVersion string) error {
	if err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(64) PRIMARY KEY,
			name VARCHAR(255) NOT NULL,
			checksum VARCHAR(64) NOT NULL,
			applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)
	`).Error; err != nil {
		return fmt.Errorf("初始化迁移登记表失败: %w", err)
	}

	ordered := append([]Migration(nil), migrations...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].Version < ordered[j].Version })
	if baselineVersion != "" {
		if err := registerBaseline(db, ordered, baselineVersion); err != nil {
			return err
		}
	}
	for _, migration := range ordered {
		if err := applyOne(db, migration); err != nil {
			return err
		}
	}
	return nil
}

// registerBaseline 将已人工确认存在的历史版本写入登记表，不重复执行历史 SQL。
func registerBaseline(db *gorm.DB, migrations []Migration, version string) error {
	if version != "004" {
		return fmt.Errorf("不支持 baseline %q，仅支持 004", version)
	}

	return db.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Table("schema_migrations").Count(&count).Error; err != nil {
			return fmt.Errorf("检查迁移登记表失败: %w", err)
		}
		if count != 0 {
			return errors.New("baseline 仅允许用于空迁移登记表")
		}
		if err := validateBaseline004(tx); err != nil {
			return err
		}

		found := false
		for _, migration := range migrations {
			if migration.Version > version {
				continue
			}
			if migration.Version == version {
				found = true
			}
			if err := tx.Exec(
				"INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)",
				migration.Version, migration.Name, checksumOf(migration.SQL),
			).Error; err != nil {
				return fmt.Errorf("登记 baseline 迁移 %s 失败: %w", migration.Version, err)
			}
		}
		if !found {
			return fmt.Errorf("未找到 baseline 迁移版本 %s", version)
		}
		return nil
	})
}

// validateBaseline004 检查 004 版本依赖的统一餐桌核心列，防止错误跳过历史迁移。
func validateBaseline004(db *gorm.DB) error {
	for _, required := range baseline004RequiredColumns {
		if !db.Migrator().HasColumn(required.table, required.column) {
			return fmt.Errorf("baseline 004 核心表列缺失: %s.%s", required.table, required.column)
		}
	}
	return nil
}

// applyOne 对单个迁移做幂等检查、校验和漂移检测和事务内执行登记。
func applyOne(db *gorm.DB, migration Migration) error {
	checksum := checksumOf(migration.SQL)
	var applied struct {
		Checksum string
	}
	result := db.Table("schema_migrations").Select("checksum").
		Where("version = ?", migration.Version).Limit(1).Find(&applied)
	if result.Error != nil {
		return fmt.Errorf("查询迁移版本 %s 失败: %w", migration.Version, result.Error)
	}
	if result.RowsAffected > 0 {
		if applied.Checksum != checksum {
			return fmt.Errorf("迁移 %s 校验和漂移", migration.Version)
		}
		return nil
	}

	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec(migration.SQL).Error; err != nil {
			return fmt.Errorf("执行迁移 %s_%s 失败: %w", migration.Version, migration.Name, err)
		}
		if err := tx.Exec(
			"INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)",
			migration.Version, migration.Name, checksum,
		).Error; err != nil {
			return fmt.Errorf("登记迁移 %s 失败: %w", migration.Version, err)
		}
		return nil
	})
}

// checksumOf 生成迁移内容的 SHA-256 校验和，用于发现已执行 SQL 被修改。
func checksumOf(sql string) string {
	sum := sha256.Sum256([]byte(sql))
	return hex.EncodeToString(sum[:])
}
