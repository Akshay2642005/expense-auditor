variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "droplet_name" {
  description = "name of the droplet"
  type        = string
  default     = "web-server-01"
  sensitive   = false
}

variable "region" {
  description = "region to deploy the droplet"
  type        = string
  default     = "blr1"
  sensitive   = false
}

variable "image" {
  description = "image to use for the droplet (e.g., ubuntu-22-04-x64)"
  type        = string
  default     = "ubuntu-22-04-x64"
  sensitive   = false
}

variable "size" {
  description = "The size slug (e.g., s-1vcpu-1gb)"
  type        = string
  default     = "s-1vcpu-1gb"
  sensitive   = false
}

variable "ssh_keys" {
  description = "SSH key IDs to add to the droplet"
  type        = list(string)
  default     = []
  sensitive   = false
}


variable "tags" {
  description = "Tags to add to the droplet"
  type        = list(string)
  default     = []
  sensitive   = false
}
