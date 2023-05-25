import { JsonIgnoreProperties, JsonProperty } from 'jackson-js';

@JsonIgnoreProperties({})
export default class FacebookResponse {
  @JsonProperty()
  private id: string;

  @JsonProperty()
  private email: string;

  @JsonProperty()
  private firstName: string;

  @JsonProperty()
  private lastName: string;

  @JsonProperty()
  private middleName: string;

  @JsonProperty()
  private name: string;

  @JsonProperty()
  private birthday: string;

  @JsonProperty()
  private gender: string;

  @JsonProperty()
  private profileUrl: string;

  @JsonProperty()
  private avatar: string;

  public setProfileUrl(profileUrl: string) {
    this.profileUrl = profileUrl;
  }

  public setAvatar(avatar: string){
    this.avatar = avatar;
  }

  public getId() {
    return this.id;
  }

  public getEmail() {
    return this.email;
  }

  public getProfileUrl() {
    return this.profileUrl;
  }

  public getFirstName() {
    return this.firstName;
  }

  public getLastName() {
    return this.lastName;
  }

  public getMiddleName() {
    return this.middleName;
  }

  public getName() {
    return this.name;
  }

  public getBirthday() {
    return this.birthday;
  }

  public getGender() {
    return this.gender;
  }

  public getAvatar() {
    return this.avatar;
  }
}
