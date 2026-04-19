package envscan

// catalog 是硬编码的扫描清单。新增工具只需在此追加一行。
//
// VersionRegex 留空时走通用正则（scanner.go 的 fallbackVersionPattern）。
// 对有特殊前缀的工具（go version goX.Y.Z / v20.10.0）单独指定可避免误抓。
var catalog = []Item{
	// ----------------- 语言 / 运行时 -----------------
	{Name: "Go", Command: "go", Args: []string{"version"}, VersionRegex: `go version go(\S+)`, Category: CategoryLanguage},
	{Name: "Python", Command: "python", Args: []string{"--version"}, Category: CategoryLanguage},
	{Name: "Python 3", Command: "python3", Args: []string{"--version"}, Category: CategoryLanguage},
	{Name: "Node.js", Command: "node", Args: []string{"--version"}, VersionRegex: `v?(\d+\.\d+\.\d+\S*)`, Category: CategoryLanguage},
	{Name: "Bun", Command: "bun", Args: []string{"--version"}, Category: CategoryLanguage},
	{Name: "Deno", Command: "deno", Args: []string{"--version"}, VersionRegex: `deno (\S+)`, Category: CategoryLanguage},
	{Name: "Java", Command: "java", Args: []string{"-version"}, VersionRegex: `version "([^"]+)"`, Category: CategoryLanguage},
	{Name: "Rust", Command: "rustc", Args: []string{"--version"}, Category: CategoryLanguage},
	{Name: "Ruby", Command: "ruby", Args: []string{"--version"}, Category: CategoryLanguage},
	{Name: "PHP", Command: "php", Args: []string{"--version"}, Category: CategoryLanguage},

	// ----------------- 包管理器 -----------------
	{Name: "npm", Command: "npm", Args: []string{"--version"}, Category: CategoryPackage},
	{Name: "pnpm", Command: "pnpm", Args: []string{"--version"}, Category: CategoryPackage},
	{Name: "yarn", Command: "yarn", Args: []string{"--version"}, Category: CategoryPackage},
	{Name: "pip", Command: "pip", Args: []string{"--version"}, VersionRegex: `pip (\S+)`, Category: CategoryPackage},
	{Name: "pip3", Command: "pip3", Args: []string{"--version"}, VersionRegex: `pip (\S+)`, Category: CategoryPackage},
	{Name: "uv", Command: "uv", Args: []string{"--version"}, Category: CategoryPackage},
	{Name: "Cargo", Command: "cargo", Args: []string{"--version"}, Category: CategoryPackage},
	{Name: "RubyGems", Command: "gem", Args: []string{"--version"}, Category: CategoryPackage},

	// ----------------- AI CLI -----------------
	{Name: "Claude Code", Command: "claude", Args: []string{"--version"}, Category: CategoryAI},
	{Name: "Codex", Command: "codex", Args: []string{"--version"}, Category: CategoryAI},
	{Name: "Gemini CLI", Command: "gemini", Args: []string{"--version"}, Category: CategoryAI},
	{Name: "Aider", Command: "aider", Args: []string{"--version"}, Category: CategoryAI},
	{Name: "Cursor Agent", Command: "cursor-agent", Args: []string{"--version"}, Category: CategoryAI},

	// ----------------- 工具链 -----------------
	{Name: "Git", Command: "git", Args: []string{"--version"}, Category: CategoryToolchain},
	{Name: "Docker", Command: "docker", Args: []string{"--version"}, Category: CategoryToolchain},
	{Name: "kubectl", Command: "kubectl", Args: []string{"version", "--client"}, VersionRegex: `v(\d+\.\d+\.\d+\S*)`, Category: CategoryToolchain},
	{Name: "GitHub CLI", Command: "gh", Args: []string{"--version"}, VersionRegex: `gh version (\S+)`, Category: CategoryToolchain},
	{Name: "Make", Command: "make", Args: []string{"--version"}, Category: CategoryToolchain},
	{Name: "CMake", Command: "cmake", Args: []string{"--version"}, VersionRegex: `cmake version (\S+)`, Category: CategoryToolchain},

	// ----------------- 数据库客户端 -----------------
	{Name: "psql", Command: "psql", Args: []string{"--version"}, Category: CategoryDatabase},
	{Name: "MySQL Client", Command: "mysql", Args: []string{"--version"}, Category: CategoryDatabase},
	{Name: "redis-cli", Command: "redis-cli", Args: []string{"--version"}, Category: CategoryDatabase},
	{Name: "mongosh", Command: "mongosh", Args: []string{"--version"}, Category: CategoryDatabase},
}
