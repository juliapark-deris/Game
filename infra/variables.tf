variable "subscription_id" {
  description = "Azure subscription ID."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
  default     = "koreacentral"
}

variable "resource_group_name" {
  description = "Resource group name."
  type        = string
  default     = "rg-flying-takoyaki"
}

variable "storage_account_prefix" {
  description = "Prefix used for storage account name. Must be 3-11 lowercase alphanumeric chars."
  type        = string
  default     = "takogame"

  validation {
    condition     = can(regex("^[a-z0-9]{3,11}$", var.storage_account_prefix))
    error_message = "storage_account_prefix must be 3-11 lowercase alphanumeric characters."
  }
}
