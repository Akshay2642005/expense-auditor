package config

import (
	"os"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	_ "github.com/joho/godotenv/autoload"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/v2"
	"github.com/rs/zerolog"
)

type Config struct {
	Primary       Primary              `koanf:"primary" validate:"required"`
	Server        ServerConfig         `koanf:"server" validate:"required"`
	Database      DatabaseConfig       `koanf:"database" validate:"required"`
	Redis         RedisConfig          `koanf:"redis" validate:"required"`
	Auth          AuthConfig           `koanf:"auth" validate:"required"`
	Integration   IntegrationConfig    `koanf:"integration" validate:"required"`
	AI            AIConfig             `koanf:"ai" validate:"required"`
	Storage       StorageConfig        `koanf:"storage" validate:"required"`
	Observability *ObservabilityConfig `koanf:"observability"`
}

type Primary struct {
	Env string `koanf:"env" validate:"required"`
}

type ServerConfig struct {
	Port               string   `koanf:"port" validate:"required"`
	ReadTimeout        int      `koanf:"read_timeout" validate:"required"`
	WriteTimeout       int      `koanf:"write_timeout" validate:"required"`
	IdleTimeout        int      `koanf:"idle_timeout" validate:"required"`
	CORSAllowedOrigins []string `koanf:"cors_allowed_origins" validate:"required"`
}

type DatabaseConfig struct {
	Host            string        `koanf:"host" validate:"required"`
	Port            int           `koanf:"port" validate:"required"`
	User            string        `koanf:"user" validate:"required"`
	Password        string        `koanf:"password" validate:"required"`
	Name            string        `koanf:"name" validate:"required"`
	SSLMode         string        `koanf:"ssl_mode" validate:"required"`
	MaxOpenConns    int32         `koanf:"max_open_conns" validate:"required"`
	MaxIdleConns    int32         `koanf:"max_idle_conns" validate:"required"`
	ConnMaxLifetime time.Duration `koanf:"conn_max_lifetime" validate:"required"`
	ConnMaxIdleTime time.Duration `koanf:"conn_max_idle_time" validate:"required"`
}

type RedisConfig struct {
	Address string `koanf:"address" validate:"required"`
}

type IntegrationConfig struct {
	ResendAPIKey string `koanf:"resend_api_key" validate:"required"`
}
type AuthConfig struct {
	SecretKey     string `koanf:"secret_key" validate:"required"`
	WebhookSecret string `koanf:"webhook_secret" validate:"required"`
}

type AIConfig struct {
	GeminiAPIKey          string `koanf:"gemini_api_key" validate:"required"`
	DateMismatchThreshold int    `koanf:"date_mismatch_threshold" validate:"required"`
}

type StorageConfig struct {
	GCSBucketName  string `koanf:"gcs_bucket_name" validate:"required"`
	GCSProjectID   string `koanf:"gcs_project_id" validate:"required"`
	GCSCredentials string `koanf:"gcs_credentials" validate:"required"`
	MaxFileSizeMB  int    `koanf:"max_file_size_mb" validate:"required"`
}

func LoadConfig() (*Config, error) {
	logger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr}).With().Timestamp().Logger()
	k := koanf.New(".")

	err := k.Load(env.Provider("EXPAU_", ".", func(s string) string {
		return strings.ToLower(strings.TrimPrefix(s, "EXPAU_"))
	}), nil)
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to load configuration")
	}

	mainConfig := &Config{}
	err = k.Unmarshal("", mainConfig)
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to unmarshal configuration")
	}

	validate := validator.New()
	err = validate.Struct(mainConfig)
	if err != nil {
		logger.Fatal().Err(err).Msg("Configuration validation failed")
	}

	if mainConfig.AI.DateMismatchThreshold == 0 {
		mainConfig.AI.DateMismatchThreshold = 7
	}
	if mainConfig.Storage.MaxFileSizeMB == 0 {
		mainConfig.Storage.MaxFileSizeMB = 10
	}

	if mainConfig.Observability == nil {
		mainConfig.Observability = DefaultObservabilityConfig()
	}

	mainConfig.Observability.Environment = mainConfig.Primary.Env
	if err := mainConfig.Observability.Validate(); err != nil {
		logger.Fatal().Err(err).Msg("Observability configuration validation failed")
	}

	return mainConfig, nil
}
