// cmd/migrate applies all pending SQL migrations using the server's .env configuration.
package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"fanda-server/internal/config"
	"fanda-server/internal/database"
	"fanda-server/internal/migrate"
)

// commandOptions 保存命令行参数，baseline 用于接管已有 004 结构的旧库。
type commandOptions struct {
	baseline string
}

// parseOptions 解析迁移命令参数，并拒绝未定义的位置参数以避免误操作。
func parseOptions(args []string, errorHandling flag.ErrorHandling) (commandOptions, error) {
	var options commandOptions
	flags := flag.NewFlagSet("migrate", errorHandling)
	flags.StringVar(&options.baseline, "baseline", "", "确认现有数据库已达到指定迁移版本（仅支持 004）")
	if err := flags.Parse(args); err != nil {
		return commandOptions{}, err
	}
	if flags.NArg() != 0 {
		return commandOptions{}, fmt.Errorf("不支持位置参数: %v", flags.Args())
	}
	return options, nil
}

// main 按“配置 → 数据库 → 读取 SQL → 执行迁移”的顺序完成一次迁移任务。
func main() {
	options, err := parseOptions(os.Args[1:], flag.ContinueOnError)
	if err != nil {
		log.Fatal(err)
	}
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("配置加载失败: %v", err)
	}
	db, err := database.OpenPostgres(cfg)
	if err != nil {
		log.Fatalf("连接数据库失败: %v", err)
	}
	migrations, err := migrate.LoadDir("migrations")
	if err != nil {
		log.Fatal(err)
	}
	if err := migrate.NewRunner(db).Run(migrations, options.baseline); err != nil {
		log.Fatal(err)
	}
	log.Printf("数据库迁移完成，共发现 %d 个版本", len(migrations))
}
